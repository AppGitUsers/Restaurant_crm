from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from django.shortcuts import get_object_or_404
from django.db import models, transaction, IntegrityError
from django.utils import timezone
from decimal import Decimal
from datetime import datetime, time as _time

from apps.accounts.permissions import IsAdmin, IsAdminOrBiller, IsAdminOrBillerOrKitchen
from .models import Kitchen, Table, TableSession, TableOrderBatch, TableOrderItem, KitchenNotification
from .serializers import (
    PublicMenuItemSerializer, OrderSubmitSerializer,
    TableSerializer, TableSessionSerializer, TableOrderBatchSerializer,
    TableAdminSerializer, KitchenSerializer,
)

import logging

logger = logging.getLogger(__name__)


# ── Throttles for public (unauthenticated) endpoints ────────────────────────

class MenuThrottle(AnonRateThrottle):
    scope = 'public_menu'    # 60/min — browsing the menu


class OrderThrottle(AnonRateThrottle):
    scope = 'public_order'   # 20/min — submitting orders


# ── Public: Customer QR endpoints (no login) ────────────────────────────────

class PublicMenuView(APIView):
    """Return the full menu grouped by category for a given table QR token."""
    permission_classes = [AllowAny]
    throttle_classes   = [MenuThrottle]

    def get(self, request, qr_token):
        table = get_object_or_404(Table, qr_token=qr_token, is_active=True)

        from apps.menu.models import FoodItem, FoodType
        items = (FoodItem.objects
                 .filter(is_active=True)
                 .select_related('food_type')
                 .prefetch_related(
                     'food_type__addons',
                     'combo_components__component',
                 )
                 .order_by('food_type__sort_order', 'food_type__name', 'name'))

        grouped = {}
        for item in items:
            ft_id = item.food_type_id
            if ft_id not in grouped:
                grouped[ft_id] = {
                    'id':    ft_id,
                    'name':  item.food_type.name,
                    'icon':  item.food_type.icon or '',
                    'items': [],
                }
            grouped[ft_id]['items'].append(
                PublicMenuItemSerializer(item, context={'request': request}).data
            )

        # Customizable types (for "Customize Your Order" modal)
        ct_list = []
        for ft in (FoodType.objects
                   .filter(is_active=True, is_customizable=True)
                   .prefetch_related('addons', 'items')):
            ct_items_qs = (FoodItem.objects
                           .filter(food_type=ft, is_active=True)
                           .prefetch_related('food_type__addons', 'combo_components__component'))
            ct_list.append({
                'id':          ft.id,
                'name':        ft.name,
                'icon':        ft.icon or '',
                'allow_addons': ft.allow_addons,
                'addons': [
                    {'id': a.id, 'name': a.name, 'price': float(a.price), 'is_costed': a.is_costed}
                    for a in ft.addons.filter(is_active=True)
                ],
                'items': PublicMenuItemSerializer(ct_items_qs, many=True, context={'request': request}).data,
            })

        # Settings
        try:
            from apps.settings_app.models import RestaurantSettings
            _s = RestaurantSettings.get_settings()
            gst_rate            = float(_s.gst_rate)
            qr_ordering_enabled = _s.qr_ordering_enabled
        except Exception:
            gst_rate            = 5.0
            qr_ordering_enabled = True

        session         = table.get_active_session()
        session_claimed = bool(session and session.session_key)
        session_orders  = []
        unseen_notifications = []
        if session:
            for batch in (session.batches
                          .prefetch_related('items__food_item')
                          .order_by('placed_at')):
                batch_items = []
                for it in batch.items.all():
                    batch_items.append({
                        'name':                it.food_item.name if it.food_item_id else (it.custom_name or 'Custom Item'),
                        'quantity':            it.quantity,
                        'unit_price':          float(it.unit_price),
                        'addon_unit_price':    float(it.addon_unit_price),
                        'notes':               it.notes,
                        'is_custom':           it.food_item_id is None,
                        'cancelled_by_kitchen': it.cancelled_by_kitchen,
                    })
                session_orders.append({
                    'id':        batch.id,
                    'status':    batch.status,
                    'placed_at': batch.placed_at,
                    'items':     batch_items,
                })
            unseen_notifications = [
                {'id': n.id, 'message': n.message}
                for n in session.notifications.filter(is_seen=False)
            ]

        return Response({
            'table_number':          table.number,
            'has_active_session':    session is not None,
            'session_claimed':       session_claimed,
            'is_accepting_orders':   table.is_accepting_orders,
            'qr_ordering_enabled':   qr_ordering_enabled,
            'gst_rate':              gst_rate,
            'categories':            list(grouped.values()),
            'customizable_types':    ct_list,
            'session_orders':        session_orders,
            'unseen_notifications':  unseen_notifications,
        })


class PublicOrderSubmitView(APIView):
    """
    Customer submits an order from the QR page.

    Concurrency design (up to 30 simultaneous orders):
    - Everything runs inside transaction.atomic()
    - All Stock rows needed by this order are locked with select_for_update()
      in ascending ingredient_id order — consistent lock ordering prevents deadlocks
    - Validation runs against the locked rows
    - If ANY item fails → ValueError raised → entire transaction rolls back
    - Only after full validation passes do we write batch/items and deduct stock
    """
    permission_classes = [AllowAny]
    throttle_classes   = [OrderThrottle]

    def post(self, request, qr_token):
        table = get_object_or_404(Table, qr_token=qr_token, is_active=True)

        # ── Optional staff authentication (waiter mode) ────────────────────────
        # A biller can send an Authorization header to place orders directly to
        # kitchen, bypassing QR-ordering-disabled check and session-key claim.
        placed_by = None
        is_waiter = False
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            result = JWTAuthentication().authenticate(request)
            if result is not None:
                auth_user, _ = result
                if hasattr(auth_user, 'role') and auth_user.role in ('BILLER', 'ADMIN'):
                    placed_by = auth_user
                    is_waiter = True
        except Exception:
            pass

        if not table.is_accepting_orders:
            return Response(
                {'error': 'This table is not currently open for orders. Please ask staff to open the table.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not is_waiter:
            try:
                from apps.settings_app.models import RestaurantSettings
                if not RestaurantSettings.get_settings().qr_ordering_enabled:
                    return Response(
                        {'error': 'Online ordering is currently disabled. Please ask staff to place your order.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            except Exception:
                pass

        serializer = OrderSubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        items_data     = serializer.validated_data['items']
        batch_notes    = serializer.validated_data.get('notes', '')
        provided_key   = serializer.validated_data.get('session_key', '')
        customer_name  = serializer.validated_data.get('customer_name', '')
        customer_phone = serializer.validated_data.get('customer_phone', '')
        order_type     = serializer.validated_data.get('order_type', 'DINE_IN')

        stock_errors = []
        batch        = None
        session      = None

        # ── Collect all food item IDs (regular + custom components) ──────────
        regular_ids   = [d['food_item'].id for d in items_data if d.get('food_item')]
        component_ids = [c.id for d in items_data if not d.get('food_item')
                         for c in d.get('components', [])]
        all_food_ids  = list(set(regular_ids + component_ids))

        from apps.menu.models import FoodItem
        food_map = {
            fi.id: fi
            for fi in FoodItem.objects
            .filter(id__in=all_food_ids)
            .prefetch_related(
                'recipe_ingredients__ingredient',
                'combo_components__component__recipe_ingredients__ingredient',
            )
        }

        try:
            with transaction.atomic():
                # ── Step 1: get or create session ──────────────────────────────
                # select_for_update() locks the session row for the duration of
                # this transaction so that two simultaneous first-orders from the
                # same table cannot both pass the session_key check at once.
                try:
                    session = (TableSession.objects
                               .select_for_update()
                               .get(table=table, status=TableSession.Status.OPEN))
                except TableSession.DoesNotExist:
                    # If the request carries a session_key it means this device
                    # previously belonged to a session that has since been billed
                    # or closed.  Reject it so a stale browser from the old party
                    # cannot sneak an order onto the newly-opened table.
                    # Note: a returning customer who scans the QR fresh will have
                    # their stale key cleared by the frontend on page load before
                    # they ever reach this point.
                    if provided_key:
                        return Response(
                            {'error': 'Your session has ended. Please scan the QR code again.'},
                            status=status.HTTP_403_FORBIDDEN,
                        )
                    try:
                        session = TableSession.objects.create(table=table)
                    except IntegrityError:
                        # Another request created it a millisecond ago — lock and reuse it
                        session = (TableSession.objects
                                   .select_for_update()
                                   .get(table=table, status=TableSession.Status.OPEN))

                # ── Session key: claim or validate ────────────────────────────
                # Waiters (authenticated staff) bypass the session key check —
                # they can always add to any open table.
                if not is_waiter:
                    if session.session_key:
                        if provided_key != session.session_key:
                            return Response(
                                {'error': 'This table session is already claimed by another device.'},
                                status=status.HTTP_403_FORBIDDEN,
                            )
                    else:
                        import secrets
                        session.session_key = secrets.token_urlsafe(16)
                        session.save(update_fields=['session_key'])

                # ── Update session customer info ───────────────────────────────
                sess_update = []
                if customer_name and customer_name != session.customer_name:
                    session.customer_name = customer_name
                    sess_update.append('customer_name')
                if customer_phone and customer_phone != session.customer_phone:
                    session.customer_phone = customer_phone
                    sess_update.append('customer_phone')
                if sess_update:
                    session.save(update_fields=sess_update)

                # ── Step 2: collect every ingredient ID we'll lock ─────────────
                ingredient_ids = set()
                for d in items_data:
                    if d.get('food_item'):
                        fi = food_map[d['food_item'].id]
                        if not fi.tracks_stock:
                            continue
                        if fi.is_combo:
                            for cc in fi.combo_components.all():
                                if cc.component.tracks_stock:
                                    for ri in cc.component.recipe_ingredients.all():
                                        ingredient_ids.add(ri.ingredient_id)
                        else:
                            for ri in fi.recipe_ingredients.all():
                                ingredient_ids.add(ri.ingredient_id)
                    else:
                        # Custom fusion item: deduct each component's recipe
                        for comp_obj in d.get('components', []):
                            comp = food_map.get(comp_obj.id)
                            if comp and comp.tracks_stock:
                                for ri in comp.recipe_ingredients.all():
                                    ingredient_ids.add(ri.ingredient_id)

                # ── Step 3: lock stock rows in sorted order (prevents deadlocks)
                from apps.inventory.models import Stock
                locked_stocks = {
                    s.ingredient_id: s
                    for s in Stock.objects
                    .select_for_update()
                    .filter(ingredient_id__in=sorted(ingredient_ids))
                }

                # ── Step 4: validate all items against locked stock ────────────
                for d in items_data:
                    qty = d['quantity']

                    if d.get('food_item'):
                        fi = food_map[d['food_item'].id]
                        if not fi.is_available:
                            stock_errors.append({'food_item': fi.id, 'name': fi.name, 'error': 'Item is currently unavailable'})
                            continue
                        if not fi.tracks_stock:
                            continue
                        if fi.is_combo:
                            for cc in fi.combo_components.all():
                                comp = cc.component
                                if not comp.tracks_stock:
                                    continue
                                for ri in comp.recipe_ingredients.all():
                                    needed = ri.quantity_required * qty
                                    stock  = locked_stocks.get(ri.ingredient_id)
                                    if stock is None or stock.current_quantity < needed:
                                        stock_errors.append({'food_item': fi.id, 'name': fi.name, 'error': 'Just ran out of stock'})
                                        break
                                else:
                                    continue
                                break
                        else:
                            for ri in fi.recipe_ingredients.all():
                                needed = ri.quantity_required * qty
                                stock  = locked_stocks.get(ri.ingredient_id)
                                if stock is None or stock.current_quantity < needed:
                                    stock_errors.append({'food_item': fi.id, 'name': fi.name, 'error': 'Just ran out of stock'})
                                    break
                    else:
                        # Custom fusion item validation
                        custom_name = d.get('custom_name', 'Custom')
                        for comp_obj in d.get('components', []):
                            comp = food_map.get(comp_obj.id)
                            if not comp:
                                continue
                            if not comp.is_available:
                                stock_errors.append({'food_item': None, 'name': custom_name, 'error': f'{comp.name} is unavailable'})
                                break
                            if comp.tracks_stock:
                                for ri in comp.recipe_ingredients.all():
                                    needed = ri.quantity_required * qty
                                    stock  = locked_stocks.get(ri.ingredient_id)
                                    if stock is None or stock.current_quantity < needed:
                                        stock_errors.append({'food_item': None, 'name': custom_name, 'error': f'{comp.name} just ran out'})
                                        break
                                else:
                                    continue
                                break

                if stock_errors:
                    raise _StockError()

                # ── Step 5: create batch + items + deduct stock ─────────────────
                from apps.inventory.models import StockTransaction

                batch = TableOrderBatch.objects.create(
                    session=session,
                    added_by=TableOrderBatch.AddedBy.BILLER if is_waiter else TableOrderBatch.AddedBy.CUSTOMER,
                    placed_by=placed_by,
                    order_type=order_type,
                    notes=batch_notes,
                    status=TableOrderBatch.Status.PENDING if is_waiter else TableOrderBatch.Status.PENDING_PAYMENT,
                )

                for d in items_data:
                    qty         = d['quantity']
                    addon_price = d.get('addon_unit_price', 0)

                    if d.get('food_item'):
                        fi = food_map[d['food_item'].id]
                        TableOrderItem.objects.create(
                            batch=batch,
                            food_item=fi,
                            quantity=qty,
                            unit_price=fi.price,
                            addon_unit_price=addon_price,
                            notes=d.get('notes', ''),
                        )
                        if not fi.tracks_stock:
                            continue
                        if fi.is_combo:
                            for cc in fi.combo_components.all():
                                comp = cc.component
                                if not comp.tracks_stock:
                                    continue
                                for ri in comp.recipe_ingredients.all():
                                    needed = ri.quantity_required * qty
                                    stock  = locked_stocks[ri.ingredient_id]
                                    stock.current_quantity -= needed
                                    stock.save(update_fields=['current_quantity'])
                                    StockTransaction.objects.create(
                                        ingredient=ri.ingredient,
                                        tx_type='OUT', quantity=needed,
                                        reference=f"table_batch:{batch.id}",
                                        note=f"Table {table.number}: {fi.name} ×{qty} (via {comp.name})",
                                    )
                        else:
                            for ri in fi.recipe_ingredients.all():
                                needed = ri.quantity_required * qty
                                stock  = locked_stocks[ri.ingredient_id]
                                stock.current_quantity -= needed
                                stock.save(update_fields=['current_quantity'])
                                StockTransaction.objects.create(
                                    ingredient=ri.ingredient,
                                    tx_type='OUT', quantity=needed,
                                    reference=f"table_batch:{batch.id}",
                                    note=f"Table {table.number}: {fi.name} ×{qty}",
                                )
                    else:
                        # Custom fusion item
                        components  = [food_map[c.id] for c in d.get('components', [])]
                        custom_name = d.get('custom_name', 'Custom')
                        unit_price  = sum(c.price for c in components)
                        TableOrderItem.objects.create(
                            batch=batch,
                            food_item=None,
                            custom_name=custom_name,
                            quantity=qty,
                            unit_price=unit_price,
                            addon_unit_price=addon_price,
                            notes=d.get('notes', ''),
                        )
                        for comp in components:
                            if not comp.tracks_stock:
                                continue
                            for ri in comp.recipe_ingredients.all():
                                needed = ri.quantity_required * qty
                                stock  = locked_stocks[ri.ingredient_id]
                                stock.current_quantity -= needed
                                stock.save(update_fields=['current_quantity'])
                                StockTransaction.objects.create(
                                    ingredient=ri.ingredient,
                                    tx_type='OUT', quantity=needed,
                                    reference=f"table_batch:{batch.id}",
                                    note=f"Table {table.number}: {custom_name} ×{qty} (via {comp.name})",
                                )

                # ── Deduct packaging at QR order placement time ────────────────
                # Uses batch.order_type (set per-batch by the customer) so mixed
                # Dine In / Parcel sessions each deduct the correct packaging.
                # At billing, CUSTOMER batches signal that deduction already happened.
                from apps.inventory.models import PackagingItem, FoodTypePackaging
                from django.db.models import F as _F
                for d in items_data:
                    if not d.get('food_item'):
                        continue
                    fi  = food_map[d['food_item'].id]
                    qty = d['quantity']
                    if not fi.food_type_id:
                        continue
                    for mapping in FoodTypePackaging.objects.filter(
                        food_type_id=fi.food_type_id,
                        order_type=batch.order_type,
                    ):
                        deduct_qty = mapping.qty_per_serving * qty
                        PackagingItem.objects.filter(pk=mapping.packaging_item_id).update(
                            current_quantity=_F('current_quantity') - deduct_qty
                        )
                        logger.info(
                            "Packaging deducted at QR order placement: table=%s food=%s order_type=%s qty=%d pkg_id=%d",
                            table.number, fi.name, batch.order_type, deduct_qty, mapping.packaging_item_id,
                        )

        except _StockError:
            logger.warning("Order rejected (stock errors): table=%s errors=%s",
                           table.number, [e['name'] for e in stock_errors])
            return Response({
                'error':        'Some items are no longer available',
                'out_of_stock': stock_errors,
            }, status=status.HTTP_409_CONFLICT)

        # ── Step 6: recalculate makeable counts (outside atomic block) ─────────
        try:
            from apps.menu.models import FoodItem as FI
            for food in FI.objects.filter(is_active=True, is_combo=False):
                food.update_makeable_count()
            for food in FI.objects.filter(is_active=True, is_combo=True):
                food.update_makeable_count()
        except Exception:
            pass

        items_count = sum(d['quantity'] for d in items_data)
        logger.info("Order placed: table=%s session=%d batch=%d items=%d",
                    table.number, session.id, batch.id, items_count)
        return Response({
            'batch_id':     batch.id,
            'session_id':   session.id,
            'session_key':  session.session_key,
            'table_number': table.number,
            'items_count':  items_count,
            'message':      'Order placed. Kitchen has been notified.',
        }, status=status.HTTP_201_CREATED)


class PublicBatchCancelView(APIView):
    """
    Customer cancels a PENDING batch within the 2-minute cancel window.

    Race condition safety:
      SELECT FOR UPDATE on the batch row means only one of (cancel, kitchen PREPARING)
      can hold the row lock at a time.
      - Cancel wins → batch deleted, kitchen UPDATE finds 0 rows (no-op)
      - Kitchen wins → batch is PREPARING when cancel reads it → 409 returned to customer
    """
    permission_classes = [AllowAny]
    throttle_classes   = [OrderThrottle]

    def post(self, request, qr_token, batch_id):
        table   = get_object_or_404(Table, qr_token=qr_token, is_active=True)
        session = table.get_active_session()
        if not session:
            return Response({'error': 'No active session.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            try:
                batch = (TableOrderBatch.objects
                         .select_for_update()
                         .get(pk=batch_id, session=session))
            except TableOrderBatch.DoesNotExist:
                return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

            if batch.status not in (TableOrderBatch.Status.PENDING, TableOrderBatch.Status.PENDING_PAYMENT):
                logger.warning("Customer cancel blocked: batch=%d already %s table=%s",
                               batch_id, batch.status, table.number)
                return Response(
                    {'error': 'This order is already being prepared and cannot be cancelled.'},
                    status=status.HTTP_409_CONFLICT,
                )

            # ── Lock all item rows — forces wait if kitchen is mid-cancel ──
            # This guarantees we read the final cancelled_by_kitchen value
            # even when kitchen and customer cancel at the exact same time.
            items = list(
                batch.items
                .select_for_update()
                .prefetch_related('food_item__recipe_ingredients')
            )

            # Build a set of ingredient IDs already handled by kitchen
            # (items where cancelled_by_kitchen=True — kitchen is final authority)
            kitchen_handled_ingredients = {}  # {ingredient_id: qty already restored by kitchen}
            for item in items:
                if not item.cancelled_by_kitchen:
                    continue
                fi = item.food_item
                if not fi or not fi.tracks_stock:
                    continue
                for ri in fi.recipe_ingredients.all():
                    kitchen_handled_ingredients[ri.ingredient_id] = (
                        kitchen_handled_ingredients.get(ri.ingredient_id, 0)
                        + ri.quantity_required * item.quantity
                    )

            # ── Reverse OUT stock transactions, skipping what kitchen handled ──
            from apps.inventory.models import Stock, StockTransaction

            out_txs = list(
                StockTransaction.objects
                .filter(reference=f"table_batch:{batch.id}", tx_type='OUT')
                .select_related('ingredient')
            )

            # Filter to only transactions that kitchen hasn't already handled
            restorable_txs = []
            for tx in out_txs:
                already_done = kitchen_handled_ingredients.get(tx.ingredient_id, 0)
                restore_qty  = tx.quantity - already_done
                if restore_qty > 0:
                    restorable_txs.append((tx, restore_qty))

            if restorable_txs:
                ingredient_ids = sorted({tx.ingredient_id for tx, _ in restorable_txs})
                locked_stocks  = {
                    s.ingredient_id: s
                    for s in Stock.objects
                    .select_for_update()
                    .filter(ingredient_id__in=ingredient_ids)
                }
                for tx, restore_qty in restorable_txs:
                    stock = locked_stocks.get(tx.ingredient_id)
                    if stock:
                        stock.current_quantity += restore_qty
                        stock.save(update_fields=['current_quantity'])

                StockTransaction.objects.bulk_create([
                    StockTransaction(
                        ingredient=tx.ingredient,
                        tx_type='IN',
                        quantity=restore_qty,
                        reference=f"cancel_batch:{batch.id}",
                        note=f"Cancelled order — reversed: {tx.note}",
                    )
                    for tx, restore_qty in restorable_txs
                ])

            # ── Restore packaging deducted at order placement time ─────────
            # Uses batch.order_type (same value used when deducting) so the
            # correct packaging is restored regardless of other batches in the session.
            from apps.inventory.models import PackagingItem, FoodTypePackaging
            from django.db.models import F as _F
            for item in items:
                if item.cancelled_by_kitchen:
                    continue
                fi = item.food_item
                if not fi or not fi.food_type_id:
                    continue
                for mapping in FoodTypePackaging.objects.filter(
                    food_type_id=fi.food_type_id,
                    order_type=batch.order_type,
                ):
                    restore_qty = mapping.qty_per_serving * item.quantity
                    PackagingItem.objects.filter(pk=mapping.packaging_item_id).update(
                        current_quantity=_F('current_quantity') + restore_qty
                    )
                    logger.info(
                        "Packaging restored on QR customer cancel: table=%s food=%s order_type=%s qty=%d pkg_id=%d",
                        table.number, fi.name, batch.order_type, restore_qty, mapping.packaging_item_id,
                    )

            batch.delete()

        # Recalculate makeable counts outside the lock
        try:
            from apps.menu.models import FoodItem as FI
            for food in FI.objects.filter(is_active=True, is_combo=False):
                food.update_makeable_count()
            for food in FI.objects.filter(is_active=True, is_combo=True):
                food.update_makeable_count()
        except Exception:
            pass

        logger.info("Order cancelled by customer: table=%s batch=%d", table.number, batch_id)
        return Response({'message': 'Order cancelled.'})


class _StockError(Exception):
    """Sentinel used to trigger atomic rollback on stock validation failure."""


class _CancelError(Exception):
    """Raised inside transaction.atomic() to surface item-cancel validation failures."""
    def __init__(self, message, http_status):
        self.message     = message
        self.http_status = http_status


# ── Kitchen: authenticated display + status update endpoints ────────────────

def _update_batch_status(batch):
    """Derive batch status from its item statuses after an item-level change."""
    active_statuses = list(
        batch.items.filter(cancelled_by_kitchen=False).values_list('status', flat=True)
    )
    if not active_statuses:
        return
    if all(s == TableOrderItem.ItemStatus.SERVED for s in active_statuses):
        new_batch_status = TableOrderBatch.Status.SERVED
    elif all(s == TableOrderItem.ItemStatus.PENDING for s in active_statuses):
        new_batch_status = TableOrderBatch.Status.PENDING
    else:
        new_batch_status = TableOrderBatch.Status.PREPARING
    if new_batch_status == batch.status:
        return
    update_fields = ['status']
    if new_batch_status == TableOrderBatch.Status.SERVED:
        batch.served_at = timezone.now()
        update_fields.append('served_at')
    batch.status = new_batch_status
    batch.save(update_fields=update_fields)


class KitchenBatchListView(APIView):
    """
    Active batches for the kitchen display (oldest first).
    Pass ?served=true to fetch the most recent 60 served batches instead.
    Kitchen users see only their kitchen's items; admin/biller/manager see all.
    """
    permission_classes = [IsAdminOrBillerOrKitchen]

    def get(self, request):
        user_kitchen_id = getattr(request.user, 'kitchen_id', None)

        if request.query_params.get('served') == 'true':
            from datetime import date as _date
            date_str = request.query_params.get('date', '')
            try:
                filter_date = _date.fromisoformat(date_str) if date_str else timezone.localdate()
            except ValueError:
                filter_date = timezone.localdate()
            from django.db.models import Prefetch
            item_qs = TableOrderItem.objects.filter(food_item__food_type__kitchen_id=user_kitchen_id) \
                if user_kitchen_id else TableOrderItem.objects.all()
            batches = (TableOrderBatch.objects
                       .filter(status=TableOrderBatch.Status.SERVED, placed_at__date=filter_date)
                       .select_related('session__table', 'billing_order', 'placed_by')
                       .prefetch_related(Prefetch('items', queryset=item_qs.select_related('food_item')))
                       .order_by('-placed_at'))
            return Response({'batches': TableOrderBatchSerializer(batches, many=True).data})

        from django.db.models import Prefetch
        item_qs = (
            TableOrderItem.objects
            .filter(food_item__food_type__kitchen_id=user_kitchen_id)
            if user_kitchen_id
            else TableOrderItem.objects.all()
        )
        batches = list(
            TableOrderBatch.objects
            .exclude(status__in=[
                TableOrderBatch.Status.SERVED,
                TableOrderBatch.Status.PENDING_PAYMENT,
                TableOrderBatch.Status.CANCELLED,
            ])
            .select_related('session__table', 'billing_order', 'placed_by')
            .prefetch_related(Prefetch('items', queryset=item_qs.select_related('food_item')))
            .order_by('placed_at')
        )

        # Drop batch from this kitchen's view once all their items are served or cancelled
        if user_kitchen_id:
            batches = [
                b for b in batches
                if any(
                    not i.cancelled_by_kitchen and i.status != TableOrderItem.ItemStatus.SERVED
                    for i in b.items.all()
                )
            ]

        # Per-kitchen pending/preparing counts from item statuses
        pending_count   = 0
        preparing_count = 0
        for b in batches:
            item_statuses = [i.status for i in b.items.all() if not i.cancelled_by_kitchen]
            if item_statuses:
                if all(s == TableOrderItem.ItemStatus.PENDING for s in item_statuses):
                    pending_count += 1
                elif any(s == TableOrderItem.ItemStatus.PREPARING for s in item_statuses):
                    preparing_count += 1

        data = TableOrderBatchSerializer(batches, many=True).data
        return Response({
            'pending_count':   pending_count,
            'preparing_count': preparing_count,
            'batches':         data,
        })


class KitchenBatchUpdateView(APIView):
    """Kitchen advances items in a batch (PENDING→PREPARING or PREPARING→SERVED)."""
    permission_classes = [IsAdminOrBillerOrKitchen]

    # Valid forward-only item transitions
    _ITEM_TRANSITIONS = {
        TableOrderItem.ItemStatus.PENDING:   TableOrderItem.ItemStatus.PREPARING,
        TableOrderItem.ItemStatus.PREPARING: TableOrderItem.ItemStatus.SERVED,
    }

    def patch(self, request, batch_id):
        batch           = get_object_or_404(TableOrderBatch, pk=batch_id)
        new_status      = request.data.get('status')
        user_kitchen_id = getattr(request.user, 'kitchen_id', None)

        with transaction.atomic():
            # Select the items this kitchen should advance
            item_qs = batch.items.filter(cancelled_by_kitchen=False)
            if user_kitchen_id:
                item_qs = item_qs.filter(food_item__food_type__kitchen_id=user_kitchen_id)

            # Determine what item-level transition to apply based on requested batch status
            if new_status == TableOrderBatch.Status.PREPARING:
                target_item_status = TableOrderItem.ItemStatus.PREPARING
                from_item_status   = TableOrderItem.ItemStatus.PENDING
            elif new_status == TableOrderBatch.Status.SERVED:
                target_item_status = TableOrderItem.ItemStatus.SERVED
                from_item_status   = TableOrderItem.ItemStatus.PREPARING
            else:
                return Response(
                    {'error': f"Invalid target status: {new_status}. Expected PREPARING or SERVED."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            items_to_advance = list(item_qs.filter(status=from_item_status))
            if not items_to_advance:
                return Response(
                    {'error': f"No items in {from_item_status} state to advance."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            item_ids = [i.id for i in items_to_advance]
            TableOrderItem.objects.filter(id__in=item_ids).update(status=target_item_status)
            batch.refresh_from_db()
            _update_batch_status(batch)

        logger.info("Kitchen batch items advanced: user=%s batch=%d → item_status=%s count=%d",
                    request.user, batch.id, target_item_status, len(item_ids))
        batch.refresh_from_db()
        return Response(TableOrderBatchSerializer(batch).data)


def _validate_kitchen_pin(pin, user):
    """Returns True if pin matches the logged-in user's account password."""
    if not pin:
        return False
    return user.check_password(pin)


def _reverse_item_packaging(item, qty_to_reverse):
    """
    Restore packaging stock for qty_to_reverse units of a counter-order item.
    Table order items are skipped because packaging is not deducted until billing time.
    """
    if not item.batch.billing_order_id:
        logger.debug("_reverse_item_packaging: skipped (table session item, packaging not yet deducted) item=%d", item.id)
        return
    fi = item.food_item
    if not fi or not fi.food_type_id:
        return
    from django.db.models import F
    from apps.inventory.models import PackagingItem, FoodTypePackaging
    order_type = item.batch.billing_order.order_type
    restored   = []
    for mapping in FoodTypePackaging.objects.filter(
        food_type_id=fi.food_type_id,
        order_type=order_type,
    ):
        qty = mapping.qty_per_serving * qty_to_reverse
        PackagingItem.objects.filter(pk=mapping.packaging_item_id).update(
            current_quantity=F('current_quantity') + qty
        )
        restored.append((mapping.packaging_item_id, qty))
    if restored:
        logger.info("Packaging restored on cancel: item=%d food=%s order=%s type=%s restored=%s",
                    item.id, fi.name,
                    item.batch.billing_order.order_number, order_type,
                    [(r[0], r[1]) for r in restored])


def _reverse_item_stock(item, qty_to_reverse):
    """Add back stock for `qty_to_reverse` units of a TableOrderItem. No-op for custom/untracked items."""
    fi = item.food_item
    if not fi or not fi.tracks_stock:
        return

    from apps.inventory.models import Stock, StockTransaction

    if fi.is_combo:
        pairs = [
            (ri.ingredient_id, ri.quantity_required)
            for cc in fi.combo_components.prefetch_related('component__recipe_ingredients').all()
            for ri in cc.component.recipe_ingredients.all()
            if cc.component.tracks_stock
        ]
    else:
        pairs = [(ri.ingredient_id, ri.quantity_required) for ri in fi.recipe_ingredients.all()]

    if not pairs:
        return

    ingredient_ids = sorted({iid for iid, _ in pairs})
    locked = {
        s.ingredient_id: s
        for s in Stock.objects.select_for_update().filter(ingredient_id__in=ingredient_ids)
    }
    if item.batch.session_id:
        location_label = f"Table {item.batch.session.table.number}"
    else:
        order_num = item.batch.billing_order.order_number if item.batch.billing_order_id else f"Batch {item.batch.id}"
        location_label = f"Counter {order_num}"

    for ingredient_id, qty_required in pairs:
        needed = qty_required * qty_to_reverse
        stock  = locked.get(ingredient_id)
        if stock:
            stock.current_quantity += needed
            stock.save(update_fields=['current_quantity'])
        StockTransaction.objects.create(
            ingredient_id=ingredient_id,
            tx_type='IN',
            quantity=needed,
            reference=f"kitchen_cancel_item:{item.id}",
            note=f"Kitchen cancel — {location_label}: {fi.name} ×{qty_to_reverse}",
        )


def _get_locked_item(item_id):
    """Fetch a TableOrderItem with a row-level lock and all relations needed for cancel/reduce."""
    return (TableOrderItem.objects
            .select_for_update(of=('self',))
            .select_related('batch__session__table', 'batch__billing_order', 'food_item__food_type')
            .prefetch_related(
                'food_item__recipe_ingredients',
                'food_item__combo_components__component__recipe_ingredients',
            )
            .get(pk=item_id))


def _do_cancel_item(item, restore_stock):
    """
    Mark item cancelled, optionally restore stock, notify customer.
    Must be called inside transaction.atomic() with item already locked.
    Raises _CancelError on validation failure.
    """
    if item.cancelled_by_kitchen:
        raise _CancelError('Item already cancelled.', status.HTTP_400_BAD_REQUEST)

    if restore_stock:
        _reverse_item_stock(item, item.quantity)
        _reverse_item_packaging(item, item.quantity)

    item.cancelled_by_kitchen = True
    item.cancelled_at         = timezone.now()
    item.save(update_fields=['cancelled_by_kitchen', 'cancelled_at'])

    # Auto-cancel the batch when every item in it is now cancelled;
    # otherwise re-derive batch status from remaining item statuses.
    batch = item.batch
    if not batch.items.filter(cancelled_by_kitchen=False).exists():
        batch.status = TableOrderBatch.Status.CANCELLED
        batch.save(update_fields=['status'])
        logger.info("Batch auto-cancelled (all items cancelled): batch=%d", batch.id)
    else:
        _update_batch_status(batch)

    item_name = item.food_item.name if item.food_item_id else (item.custom_name or 'Custom Item')
    logger.info("Item cancelled: item=%d name=%s qty=%d batch=%d", item.id, item_name, item.quantity, item.batch_id)
    if item.batch.session_id:
        KitchenNotification.objects.create(
            session=item.batch.session,
            message=f"Sorry, {item_name} ×{item.quantity} has been removed from your order.",
        )


def _do_reduce_item(item, new_quantity, restore_stock):
    """
    Reduce item quantity, optionally restore difference in stock, notify customer.
    Must be called inside transaction.atomic() with item already locked.
    Raises _CancelError on validation failure.
    """
    if item.cancelled_by_kitchen:
        raise _CancelError('Item already cancelled.', status.HTTP_400_BAD_REQUEST)

    if new_quantity >= item.quantity:
        raise _CancelError(
            f'New quantity must be less than current quantity ({item.quantity}).',
            status.HTTP_400_BAD_REQUEST,
        )

    qty_diff      = item.quantity - new_quantity
    orig_quantity = item.quantity
    item_name     = item.food_item.name if item.food_item_id else (item.custom_name or 'Custom Item')

    if restore_stock:
        _reverse_item_stock(item, qty_diff)
        _reverse_item_packaging(item, qty_diff)

    item.quantity = new_quantity
    item.save(update_fields=['quantity'])
    logger.info("Item quantity reduced: item=%d name=%s %d → %d batch=%d",
                item.id, item_name, orig_quantity, new_quantity, item.batch_id)

    if item.batch.session_id:
        KitchenNotification.objects.create(
            session=item.batch.session,
            message=f"Sorry, {item_name} quantity reduced from {orig_quantity} to {new_quantity} — only {new_quantity} available.",
        )


def _refresh_makeable_counts():
    """Recalculate makeable_count for all active food items. Call outside transaction.atomic()."""
    try:
        from apps.menu.models import FoodItem as FI
        for food in FI.objects.filter(is_active=True, is_combo=False):
            food.update_makeable_count()
        for food in FI.objects.filter(is_active=True, is_combo=True):
            food.update_makeable_count()
    except Exception:
        pass


class KitchenCancelItemView(APIView):
    """Kitchen cancels a single item. Optionally restores stock when restore_stock=true."""
    permission_classes = [IsAdminOrBillerOrKitchen]

    def post(self, request, item_id):
        pin             = request.data.get('pin', '')
        restore_stock   = bool(request.data.get('restore_stock', False))
        user_kitchen_id = getattr(request.user, 'kitchen_id', None)

        if not _validate_kitchen_pin(pin, request.user):
            logger.warning("Kitchen cancel: wrong PIN by user=%s for item=%s", request.user, item_id)
            return Response({'error': 'Incorrect PIN.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            with transaction.atomic():
                try:
                    item = _get_locked_item(item_id)
                except TableOrderItem.DoesNotExist:
                    return Response({'error': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
                if user_kitchen_id and item.food_item and item.food_item.food_type.kitchen_id != user_kitchen_id:
                    return Response({'error': 'This item belongs to a different kitchen.'}, status=status.HTTP_403_FORBIDDEN)
                _do_cancel_item(item, restore_stock)
        except _CancelError as e:
            return Response({'error': e.message}, status=e.http_status)

        if restore_stock:
            _refresh_makeable_counts()

        logger.info("Kitchen cancel done: user=%s item=%d restore_stock=%s", request.user, item_id, restore_stock)
        return Response({'message': 'Item cancelled.', 'item_id': item_id})


class KitchenReduceItemView(APIView):
    """Kitchen reduces the quantity of a single item. Reverses stock for the difference, notifies customer."""
    permission_classes = [IsAdminOrBillerOrKitchen]

    def post(self, request, item_id):
        pin             = request.data.get('pin', '')
        new_quantity    = request.data.get('new_quantity')
        restore_stock   = bool(request.data.get('restore_stock', False))
        user_kitchen_id = getattr(request.user, 'kitchen_id', None)

        if not _validate_kitchen_pin(pin, request.user):
            logger.warning("Kitchen reduce: wrong PIN by user=%s for item=%s", request.user, item_id)
            return Response({'error': 'Incorrect PIN.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            new_quantity = int(new_quantity)
            if new_quantity < 1:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'error': 'new_quantity must be a positive integer.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                try:
                    item = _get_locked_item(item_id)
                except TableOrderItem.DoesNotExist:
                    return Response({'error': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
                if user_kitchen_id and item.food_item and item.food_item.food_type.kitchen_id != user_kitchen_id:
                    return Response({'error': 'This item belongs to a different kitchen.'}, status=status.HTTP_403_FORBIDDEN)
                _do_reduce_item(item, new_quantity, restore_stock)
        except _CancelError as e:
            return Response({'error': e.message}, status=e.http_status)

        if restore_stock:
            _refresh_makeable_counts()

        logger.info("Kitchen reduce done: user=%s item=%d new_qty=%d restore_stock=%s",
                    request.user, item_id, new_quantity, restore_stock)
        return Response({'message': 'Quantity reduced.', 'item_id': item_id, 'new_quantity': new_quantity})


class BillerCancelItemView(APIView):
    """Biller cancels a single item from a PENDING_PAYMENT batch. Always restores stock."""
    permission_classes = [IsAdminOrBiller]

    def post(self, request, item_id):
        pin           = request.data.get('pin', '')
        restore_stock = bool(request.data.get('restore_stock', True))

        if not _validate_kitchen_pin(pin, request.user):
            logger.warning("Biller cancel: wrong PIN by user=%s for item=%s", request.user, item_id)
            return Response({'error': 'Incorrect PIN.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            with transaction.atomic():
                try:
                    item = _get_locked_item(item_id)
                except TableOrderItem.DoesNotExist:
                    return Response({'error': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
                if item.batch.status != TableOrderBatch.Status.PENDING_PAYMENT:
                    logger.warning("Biller cancel blocked: item=%d not PENDING_PAYMENT (status=%s)",
                                   item_id, item.batch.status)
                    raise _CancelError(
                        'Order is no longer awaiting payment. Ask kitchen to cancel if needed.',
                        status.HTTP_409_CONFLICT,
                    )
                _do_cancel_item(item, restore_stock)
        except _CancelError as e:
            return Response({'error': e.message}, status=e.http_status)

        if restore_stock:
            _refresh_makeable_counts()

        logger.info("Biller cancel done: user=%s item=%d restore_stock=%s", request.user, item_id, restore_stock)
        return Response({'message': 'Item cancelled.', 'item_id': item_id})


class BillerReduceItemView(APIView):
    """Biller reduces quantity of a single item from a PENDING_PAYMENT batch. Always restores stock difference."""
    permission_classes = [IsAdminOrBiller]

    def post(self, request, item_id):
        pin           = request.data.get('pin', '')
        new_quantity  = request.data.get('new_quantity')
        restore_stock = bool(request.data.get('restore_stock', True))

        if not _validate_kitchen_pin(pin, request.user):
            logger.warning("Biller reduce: wrong PIN by user=%s for item=%s", request.user, item_id)
            return Response({'error': 'Incorrect PIN.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            new_quantity = int(new_quantity)
            if new_quantity < 1:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'error': 'new_quantity must be a positive integer.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                try:
                    item = _get_locked_item(item_id)
                except TableOrderItem.DoesNotExist:
                    return Response({'error': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
                if item.batch.status != TableOrderBatch.Status.PENDING_PAYMENT:
                    logger.warning("Biller reduce blocked: item=%d not PENDING_PAYMENT (status=%s)",
                                   item_id, item.batch.status)
                    raise _CancelError(
                        'Order is no longer awaiting payment. Ask kitchen to reduce if needed.',
                        status.HTTP_409_CONFLICT,
                    )
                _do_reduce_item(item, new_quantity, restore_stock)
        except _CancelError as e:
            return Response({'error': e.message}, status=e.http_status)

        if restore_stock:
            _refresh_makeable_counts()

        logger.info("Biller reduce done: user=%s item=%d new_qty=%d restore_stock=%s",
                    request.user, item_id, new_quantity, restore_stock)
        return Response({'message': 'Quantity reduced.', 'item_id': item_id, 'new_quantity': new_quantity})


class CustomerAckNotificationView(APIView):
    """Customer dismisses (marks seen) all unseen notifications for their active session."""
    permission_classes = [AllowAny]
    throttle_classes   = [OrderThrottle]

    def post(self, request, qr_token):
        table   = get_object_or_404(Table, qr_token=qr_token, is_active=True)
        session = table.get_active_session()
        if session:
            ids = request.data.get('ids', [])
            qs  = session.notifications.filter(is_seen=False)
            if ids:
                qs = qs.filter(id__in=ids)
            qs.update(is_seen=True)
        return Response({'ok': True})


# ── Biller: authenticated table management endpoints ────────────────────────

class TableListView(APIView):
    """All tables with their active session summary — for the biller's grid."""
    permission_classes = [IsAdminOrBiller]

    def get(self, request):
        tables = (Table.objects
                  .filter(is_active=True)
                  .prefetch_related('sessions__batches__items'))
        return Response(TableSerializer(tables, many=True).data)


class TableSessionDetailView(APIView):
    """Full session detail — all batches and items — for the biller's bill screen."""
    permission_classes = [IsAdminOrBiller]

    def get(self, request, session_id):
        from django.db.models import Prefetch as _Prefetch
        batch_qs = (TableOrderBatch.objects
                    .select_related('placed_by')
                    .prefetch_related('items__food_item'))
        session = get_object_or_404(
            TableSession.objects.prefetch_related(_Prefetch('batches', queryset=batch_qs)),
            pk=session_id,
        )
        return Response(TableSessionSerializer(session).data)


class TableSessionAddBatchView(APIView):
    """Biller manually adds items to an open session (extra order at the table)."""
    permission_classes = [IsAdminOrBiller]

    def post(self, request, session_id):
        session = get_object_or_404(TableSession, pk=session_id, status=TableSession.Status.OPEN)

        from .serializers import OrderSubmitSerializer
        serializer = OrderSubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        items_data  = serializer.validated_data['items']
        batch_notes = serializer.validated_data.get('notes', '')
        table       = session.table
        stock_errors = []
        batch        = None

        try:
            with transaction.atomic():
                food_item_ids = [d['food_item'].id for d in items_data]
                from apps.menu.models import FoodItem
                food_map = {
                    fi.id: fi
                    for fi in FoodItem.objects
                    .filter(id__in=food_item_ids)
                    .prefetch_related(
                        'recipe_ingredients__ingredient',
                        'combo_components__component__recipe_ingredients__ingredient',
                    )
                }

                ingredient_ids = set()
                for d in items_data:
                    fi = food_map[d['food_item'].id]
                    if not fi.tracks_stock:
                        continue
                    if fi.is_combo:
                        for cc in fi.combo_components.all():
                            if cc.component.tracks_stock:
                                for ri in cc.component.recipe_ingredients.all():
                                    ingredient_ids.add(ri.ingredient_id)
                    else:
                        for ri in fi.recipe_ingredients.all():
                            ingredient_ids.add(ri.ingredient_id)

                from apps.inventory.models import Stock
                locked_stocks = {
                    s.ingredient_id: s
                    for s in Stock.objects
                    .select_for_update()
                    .filter(ingredient_id__in=sorted(ingredient_ids))
                }

                for d in items_data:
                    fi  = food_map[d['food_item'].id]
                    qty = d['quantity']
                    if not fi.is_available:
                        stock_errors.append({'food_item': fi.id, 'name': fi.name, 'error': 'Item unavailable'})
                        continue
                    if not fi.tracks_stock:
                        continue
                    if fi.is_combo:
                        for cc in fi.combo_components.all():
                            comp = cc.component
                            if not comp.tracks_stock:
                                continue
                            for ri in comp.recipe_ingredients.all():
                                needed = ri.quantity_required * qty
                                s = locked_stocks.get(ri.ingredient_id)
                                if s is None or s.current_quantity < needed:
                                    stock_errors.append({'food_item': fi.id, 'name': fi.name, 'error': 'Insufficient stock'})
                                    break
                            else:
                                continue
                            break
                    else:
                        for ri in fi.recipe_ingredients.all():
                            needed = ri.quantity_required * qty
                            s = locked_stocks.get(ri.ingredient_id)
                            if s is None or s.current_quantity < needed:
                                stock_errors.append({'food_item': fi.id, 'name': fi.name, 'error': 'Insufficient stock'})
                                break

                if stock_errors:
                    raise _StockError()

                from apps.inventory.models import StockTransaction
                batch = TableOrderBatch.objects.create(
                    session=session,
                    added_by=TableOrderBatch.AddedBy.BILLER,
                    placed_by=request.user,
                    notes=batch_notes,
                    status=TableOrderBatch.Status.PENDING,
                )
                for d in items_data:
                    fi  = food_map[d['food_item'].id]
                    qty = d['quantity']
                    TableOrderItem.objects.create(
                        batch=batch, food_item=fi, quantity=qty,
                        unit_price=fi.price, notes=d.get('notes', ''),
                    )
                    if not fi.tracks_stock:
                        continue
                    if fi.is_combo:
                        for cc in fi.combo_components.all():
                            comp = cc.component
                            if not comp.tracks_stock:
                                continue
                            for ri in comp.recipe_ingredients.all():
                                needed = ri.quantity_required * qty
                                s = locked_stocks[ri.ingredient_id]
                                s.current_quantity -= needed
                                s.save(update_fields=['current_quantity'])
                                StockTransaction.objects.create(
                                    ingredient=ri.ingredient, tx_type='OUT', quantity=needed,
                                    reference=f"table_batch:{batch.id}",
                                    note=f"Table {table.number} (biller): {fi.name} ×{qty} (via {comp.name})",
                                )
                    else:
                        for ri in fi.recipe_ingredients.all():
                            needed = ri.quantity_required * qty
                            s = locked_stocks[ri.ingredient_id]
                            s.current_quantity -= needed
                            s.save(update_fields=['current_quantity'])
                            StockTransaction.objects.create(
                                ingredient=ri.ingredient, tx_type='OUT', quantity=needed,
                                reference=f"table_batch:{batch.id}",
                                note=f"Table {table.number} (biller): {fi.name} ×{qty}",
                            )

        except _StockError:
            return Response({'error': 'Some items are out of stock', 'out_of_stock': stock_errors},
                            status=status.HTTP_409_CONFLICT)

        try:
            from apps.menu.models import FoodItem as FI
            for food in FI.objects.filter(is_active=True, is_combo=False):
                food.update_makeable_count()
            for food in FI.objects.filter(is_active=True, is_combo=True):
                food.update_makeable_count()
        except Exception:
            pass

        from .serializers import TableOrderBatchSerializer
        items_placed = sum(d['quantity'] for d in items_data)
        logger.info("Biller batch added: user=%s session=%d batch=%d items=%d table=%s",
                    request.user, session_id, batch.id, items_placed, table.number)
        return Response(TableOrderBatchSerializer(batch).data, status=status.HTTP_201_CREATED)


class TableSessionBillView(APIView):
    """
    Biller releases PENDING_PAYMENT batches to the kitchen after collecting payment.
    Session stays OPEN — no billing, no close. Customer can keep ordering.
    """
    permission_classes = [IsAdminOrBiller]

    def post(self, request, session_id):
        session = get_object_or_404(TableSession, pk=session_id, status=TableSession.Status.OPEN)

        # Save customer info if biller filled it in during this release
        customer_name  = request.data.get('customer_name', '').strip()
        customer_phone = request.data.get('customer_phone', '').strip()
        update_fields  = []
        if customer_name:
            session.customer_name = customer_name
            update_fields.append('customer_name')
        if customer_phone:
            session.customer_phone = customer_phone
            update_fields.append('customer_phone')
        if update_fields:
            session.save(update_fields=update_fields)

        released = session.batches.filter(
            status=TableOrderBatch.Status.PENDING_PAYMENT
        ).update(status=TableOrderBatch.Status.PENDING)

        if released == 0:
            logger.warning("Release to kitchen: no PENDING_PAYMENT batches in session=%d user=%s",
                           session_id, request.user)
            return Response({'error': 'No orders awaiting payment.'}, status=status.HTTP_400_BAD_REQUEST)

        logger.info("Released to kitchen: session=%d batches=%d user=%s", session_id, released, request.user)
        return Response({'released': released})


# ── Biller: manually end a session (without billing) ────────────────────────

class TableSessionEndView(APIView):
    """
    Biller closes the session with final billing.
    Blocked if any PENDING_PAYMENT batch exists — release them to the kitchen first.
    Creates a PAID Order from all non-cancelled session items and fires the income signal.
    If no items exist (all cancelled), closes without billing.
    """
    permission_classes = [IsAdminOrBiller]

    def post(self, request, session_id):
        session = get_object_or_404(TableSession, pk=session_id, status=TableSession.Status.OPEN)

        if session.batches.filter(status=TableOrderBatch.Status.PENDING_PAYMENT).exists():
            logger.warning("Session end blocked: PENDING_PAYMENT batches exist session=%d user=%s",
                           session_id, request.user)
            return Response(
                {'error': 'Some orders are still awaiting payment. Release them to kitchen before ending the session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment_method = request.data.get('payment_method', 'CASH')
        discount       = request.data.get('discount', 0)
        # BillModal submits whatever the biller confirmed (pre-filled from session or edited);
        # fall back to session if the biller left the name/phone blank.
        customer_name  = request.data.get('customer_name', '') or session.customer_name
        customer_phone = request.data.get('customer_phone', '') or session.customer_phone
        order_type     = request.data.get('order_type', 'DINE_IN')

        all_batch_items = []
        for batch in session.batches.prefetch_related('items__food_item').all():
            for item in batch.items.all():
                if not item.cancelled_by_kitchen:
                    all_batch_items.append(item)

        with transaction.atomic():
            order = None

            if all_batch_items:
                try:
                    tax_percent = __import__(
                        'apps.settings_app.models', fromlist=['RestaurantSettings']
                    ).RestaurantSettings.get_settings().gst_rate
                except Exception:
                    tax_percent = 5.00

                from apps.billing.models import Order, OrderItem

                order = Order.objects.create(
                    biller         = request.user,
                    customer_name  = customer_name,
                    customer_phone = customer_phone,
                    payment_method = payment_method,
                    order_type     = order_type,
                    discount       = discount,
                    tax_percent    = tax_percent,
                    table_session  = session,
                )

                for item in all_batch_items:
                    OrderItem.objects.create(
                        order            = order,
                        food_item        = item.food_item,
                        quantity         = item.quantity,
                        unit_price       = item.unit_price,
                        addon_unit_price = item.addon_unit_price,
                        notes            = item.notes,
                    )

                order.recalculate_totals()
                order.status = Order.Status.PAID
                order.save(update_fields=['status'])

                # Packaging was already deducted per-batch at QR order placement time.
                # Only deduct at billing if this session had no QR customer batches
                # (i.e. biller-only session where packaging was never pre-deducted).
                had_qr_orders = session.batches.filter(
                    added_by=TableOrderBatch.AddedBy.CUSTOMER
                ).exists()
                if not had_qr_orders:
                    from apps.billing.views import _deduct_packaging_for_order
                    _deduct_packaging_for_order(order)

                session.discount = discount

            save_fields = ['status', 'session_key', 'closed_at']
            if all_batch_items:
                save_fields.append('discount')

            session.status      = TableSession.Status.BILLED if all_batch_items else TableSession.Status.CLOSED
            session.session_key = ''
            session.closed_at   = timezone.now()
            session.save(update_fields=save_fields)

            session.table.is_accepting_orders = False
            session.table.save(update_fields=['is_accepting_orders'])

        if order:
            logger.info("Session billed: user=%s session=%d order=%s total=%s method=%s type=%s customer=%s",
                        request.user, session_id, order.order_number,
                        order.total_amount, payment_method, order_type, customer_name or 'Walk-in')
            try:
                from apps.notifications.utils import send_bill_notification
                send_bill_notification(order)
            except Exception:
                pass

            from apps.billing.serializers import OrderSerializer
            return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

        logger.info("Session closed (no billable items): user=%s session=%d", request.user, session_id)
        return Response({'status': 'closed', 'session_id': session.id})


# ── Biller: open / close a table for ordering ───────────────────────────────

class TableOpenView(APIView):
    """
    Toggle whether a table is accepting orders.

    POST → opens the table (is_accepting_orders = True).
    Calling again on an already-open table with no active session closes it
    (useful if the biller opened the wrong table by mistake).
    Cannot close while an active session exists — bill or end the session first.
    """
    permission_classes = [IsAdminOrBiller]

    def post(self, request, table_id):
        table = get_object_or_404(Table, pk=table_id, is_active=True)

        if table.is_accepting_orders:
            # Toggle off — only if no active session
            if table.get_active_session():
                logger.warning("Table close blocked (active session): user=%s table=%s", request.user, table.number)
                return Response(
                    {'error': 'Cannot close a table with an active session. Bill or end the session first.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            table.is_accepting_orders = False
            logger.info("Table closed: user=%s table=%s", request.user, table.number)
        else:
            table.is_accepting_orders = True
            logger.info("Table opened: user=%s table=%s", request.user, table.number)

        table.save(update_fields=['is_accepting_orders'])
        return Response({'is_accepting_orders': table.is_accepting_orders, 'table_id': table.id})


# ── Admin: Table CRUD ────────────────────────────────────────────────────────

class TableAdminListCreateView(APIView):
    """List all tables (including inactive) and create new ones. Admin only."""
    permission_classes = [IsAdmin]

    def get(self, request):
        tables = Table.objects.all().order_by('number')
        return Response(TableAdminSerializer(tables, many=True).data)

    def post(self, request):
        serializer = TableAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        table = serializer.save()
        logger.info("Table created: admin=%s number=%s", request.user, table.number)
        return Response(TableAdminSerializer(table).data, status=status.HTTP_201_CREATED)


class TableAdminDetailView(APIView):
    """Retrieve, update, or delete a single table. Admin only."""
    permission_classes = [IsAdmin]

    def get(self, request, table_id):
        table = get_object_or_404(Table, pk=table_id)
        return Response(TableAdminSerializer(table).data)

    def patch(self, request, table_id):
        table = get_object_or_404(Table, pk=table_id)
        serializer = TableAdminSerializer(table, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        table = serializer.save()
        logger.info("Table updated: admin=%s table=%s fields=%s", request.user, table.number, list(request.data.keys()))
        return Response(TableAdminSerializer(table).data)

    def delete(self, request, table_id):
        table = get_object_or_404(Table, pk=table_id)
        if table.sessions.filter(status=TableSession.Status.OPEN).exists():
            logger.warning("Table delete blocked (open session): admin=%s table=%s", request.user, table.number)
            return Response(
                {'error': 'Cannot delete a table with an open session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        logger.info("Table deleted: admin=%s table=%s", request.user, table.number)
        table.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Today's Orders dashboard ─────────────────────────────────────────────────

class TodaySessionsView(APIView):
    """
    Returns all table sessions opened today along with per-batch detail
    and a summary card for the dashboard header.
    """
    permission_classes = [IsAdminOrBiller]

    def get(self, request):
        from django.db.models import Q

        local_tz  = timezone.get_current_timezone()
        today     = timezone.localdate()
        day_start = timezone.make_aware(datetime.combine(today, _time.min), local_tz)
        day_end   = timezone.make_aware(datetime.combine(today, _time.max), local_tz)

        # OPEN   — currently active (always show regardless of date)
        # CLOSED — awaiting billing (always show regardless of date)
        # BILLED — today only
        sessions = list(
            TableSession.objects
            .filter(
                Q(status__in=[TableSession.Status.OPEN, TableSession.Status.CLOSED]) |
                Q(status=TableSession.Status.BILLED, closed_at__gte=day_start, closed_at__lte=day_end)
            )
            .select_related('table', 'order', 'order__biller')
            .prefetch_related('batches__items__food_item', 'order__items__food_item')
            .order_by('-opened_at')
        )

        biller_batches   = 0
        customer_batches = 0
        table_revenue    = Decimal('0')   # table billings today only
        active_count     = 0

        for s in sessions:
            if s.status == TableSession.Status.BILLED:
                if s.closed_at and s.closed_at >= day_start:
                    table_revenue += s.subtotal
            if s.status == TableSession.Status.OPEN:
                active_count += 1
            for b in s.batches.all():
                if b.added_by == TableOrderBatch.AddedBy.BILLER:
                    biller_batches += 1
                else:
                    customer_batches += 1

        # ── Counter (quick-bill) orders — no table session ───────────────────
        from apps.billing.models import Order as BillingOrder

        counter_orders = list(
            BillingOrder.objects
            .filter(table_session__isnull=True, status=BillingOrder.Status.PAID,
                    created_at__gte=day_start, created_at__lte=day_end)
            .prefetch_related('items__food_item')
            .select_related('biller')
            .order_by('-created_at')
        )

        counter_revenue = sum((o.total_amount for o in counter_orders), Decimal('0'))

        def _serialize_counter(o):
            return {
                'id':             o.id,
                'order_number':   o.order_number,
                'share_token':    str(o.share_token),
                'customer_name':  o.customer_name,
                'customer_phone': o.customer_phone,
                'payment_method': o.payment_method,
                'subtotal':       float(o.subtotal),
                'tax_amount':     float(o.tax_amount),
                'total_amount':   float(o.total_amount),
                'discount':       float(o.discount),
                'created_at':     o.created_at.isoformat(),
                'biller_name':    (o.biller.get_full_name() or o.biller.username) if o.biller else '—',
                'items': [
                    {
                        'name':       i.food_item.name if i.food_item_id else (i.custom_name or 'Custom'),
                        'quantity':   i.quantity,
                        'line_total': float(i.line_total),
                        'notes':      i.notes,
                    }
                    for i in o.items.all()
                ],
            }

        def _billing_order_summary(s):
            try:
                o = s.order
            except Exception:
                return None
            return {
                'order_number':   o.order_number,
                'share_token':    str(o.share_token),
                'customer_name':  o.customer_name,
                'customer_phone': o.customer_phone,
                'payment_method': o.payment_method,
                'subtotal':       float(o.subtotal),
                'discount':       float(o.discount),
                'tax_amount':     float(o.tax_amount),
                'total_amount':   float(o.total_amount),
                'items': [
                    {
                        'food_item_name': i.food_item.name if i.food_item_id else (i.custom_name or 'Custom'),
                        'quantity':       i.quantity,
                        'line_total':     float(i.line_total),
                        'notes':          i.notes,
                    }
                    for i in o.items.all()
                ],
            }

        sessions_data = TableSessionSerializer(sessions, many=True).data
        result_sessions = []
        for s_data, s_obj in zip(sessions_data, sessions):
            d = dict(s_data)
            d['billing_order'] = (
                _billing_order_summary(s_obj)
                if s_obj.status == TableSession.Status.BILLED
                else None
            )
            result_sessions.append(d)

        return Response({
            'date': str(today),
            'summary': {
                'total_sessions':      len(sessions),
                'active_sessions':     active_count,
                'today_revenue':       float(table_revenue + counter_revenue),
                'biller_batches':      biller_batches,
                'customer_batches':    customer_batches,
                'counter_bills_today': len(counter_orders),
            },
            'sessions':       result_sessions,
            'counter_orders': [_serialize_counter(o) for o in counter_orders],
        })


# ── Kitchen admin: CRUD for kitchen stations ────────────────────────────────

class KitchenAdminListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        kitchens = Kitchen.objects.all()
        return Response(KitchenSerializer(kitchens, many=True).data)

    def post(self, request):
        serializer = KitchenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        kitchen = serializer.save()
        logger.info("Kitchen created: admin=%s name=%s", request.user, kitchen.name)
        return Response(KitchenSerializer(kitchen).data, status=status.HTTP_201_CREATED)


class KitchenAdminDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, kitchen_id):
        kitchen    = get_object_or_404(Kitchen, pk=kitchen_id)
        serializer = KitchenSerializer(kitchen, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info("Kitchen updated: admin=%s id=%d name=%s", request.user, kitchen_id, kitchen.name)
        return Response(KitchenSerializer(kitchen).data)

    def delete(self, request, kitchen_id):
        kitchen = get_object_or_404(Kitchen, pk=kitchen_id)
        name    = kitchen.name
        kitchen.delete()
        logger.info("Kitchen deleted: admin=%s id=%d name=%s", request.user, kitchen_id, name)
        return Response(status=status.HTTP_204_NO_CONTENT)
