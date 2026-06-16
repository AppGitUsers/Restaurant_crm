from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from django.shortcuts import get_object_or_404
from django.db import transaction, IntegrityError

from apps.accounts.permissions import IsAdmin, IsAdminOrBiller, IsAdminOrBillerOrKitchen
from .models import Table, TableSession, TableOrderBatch, TableOrderItem
from .serializers import (
    PublicMenuItemSerializer, OrderSubmitSerializer,
    TableSerializer, TableSessionSerializer, TableOrderBatchSerializer,
    TableAdminSerializer,
)


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

        # GST rate from restaurant settings
        try:
            from apps.settings_app.models import RestaurantSettings
            gst_rate = float(RestaurantSettings.get_settings().gst_rate)
        except Exception:
            gst_rate = 5.0

        session         = table.get_active_session()
        session_claimed = bool(session and session.session_key)
        session_orders  = []
        if session:
            for batch in (session.batches
                          .prefetch_related('items__food_item')
                          .order_by('placed_at')):
                batch_items = []
                for it in batch.items.all():
                    batch_items.append({
                        'name':             it.food_item.name if it.food_item_id else (it.custom_name or 'Custom Item'),
                        'quantity':         it.quantity,
                        'unit_price':       float(it.unit_price),
                        'addon_unit_price': float(it.addon_unit_price),
                        'notes':            it.notes,
                        'is_custom':        it.food_item_id is None,
                    })
                session_orders.append({
                    'id':        batch.id,
                    'status':    batch.status,
                    'placed_at': batch.placed_at,
                    'items':     batch_items,
                })

        return Response({
            'table_number':       table.number,
            'has_active_session': session is not None,
            'session_claimed':    session_claimed,
            'gst_rate':           gst_rate,
            'categories':         list(grouped.values()),
            'customizable_types': ct_list,
            'session_orders':     session_orders,
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

        serializer = OrderSubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        items_data    = serializer.validated_data['items']
        batch_notes   = serializer.validated_data.get('notes', '')
        provided_key  = serializer.validated_data.get('session_key', '')

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
                try:
                    session = TableSession.objects.get(
                        table=table, status=TableSession.Status.OPEN
                    )
                except TableSession.DoesNotExist:
                    try:
                        session = TableSession.objects.create(table=table)
                    except IntegrityError:
                        session = TableSession.objects.get(
                            table=table, status=TableSession.Status.OPEN
                        )

                # ── Session key: claim or validate ────────────────────────────
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
                    added_by=TableOrderBatch.AddedBy.CUSTOMER,
                    notes=batch_notes,
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

        except _StockError:
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

        return Response({
            'batch_id':     batch.id,
            'session_id':   session.id,
            'session_key':  session.session_key,
            'table_number': table.number,
            'items_count':  sum(d['quantity'] for d in items_data),
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

            if batch.status != TableOrderBatch.Status.PENDING:
                return Response(
                    {'error': 'This order is already being prepared and cannot be cancelled.'},
                    status=status.HTTP_409_CONFLICT,
                )

            # ── Reverse every OUT stock transaction created for this batch ──
            from apps.inventory.models import Stock, StockTransaction

            out_txs = list(
                StockTransaction.objects
                .filter(reference=f"table_batch:{batch.id}", tx_type='OUT')
                .select_related('ingredient')
            )

            if out_txs:
                ingredient_ids = sorted({tx.ingredient_id for tx in out_txs})
                locked_stocks  = {
                    s.ingredient_id: s
                    for s in Stock.objects
                    .select_for_update()
                    .filter(ingredient_id__in=ingredient_ids)
                }
                for tx in out_txs:
                    stock = locked_stocks.get(tx.ingredient_id)
                    if stock:
                        stock.current_quantity += tx.quantity
                        stock.save(update_fields=['current_quantity'])

                StockTransaction.objects.bulk_create([
                    StockTransaction(
                        ingredient=tx.ingredient,
                        tx_type='IN',
                        quantity=tx.quantity,
                        reference=f"cancel_batch:{batch.id}",
                        note=f"Cancelled order — reversed: {tx.note}",
                    )
                    for tx in out_txs
                ])

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

        return Response({'message': 'Order cancelled.'})


class _StockError(Exception):
    """Sentinel used to trigger atomic rollback on stock validation failure."""


# ── Kitchen: authenticated display + status update endpoints ────────────────

class KitchenBatchListView(APIView):
    """
    Active batches for the kitchen display (oldest first).
    Pass ?served=true to fetch the most recent 60 served batches instead.
    """
    permission_classes = [IsAdminOrBillerOrKitchen]

    def get(self, request):
        if request.query_params.get('served') == 'true':
            batches = (TableOrderBatch.objects
                       .filter(status=TableOrderBatch.Status.SERVED)
                       .select_related('session__table')
                       .prefetch_related('items__food_item')
                       .order_by('-placed_at')[:60])
            return Response({'batches': TableOrderBatchSerializer(batches, many=True).data})

        batches = list(
            TableOrderBatch.objects
            .exclude(status=TableOrderBatch.Status.SERVED)
            .select_related('session__table')
            .prefetch_related('items__food_item')
            .order_by('placed_at')
        )
        data = TableOrderBatchSerializer(batches, many=True).data
        return Response({
            'pending_count':   sum(1 for b in batches if b.status == TableOrderBatch.Status.PENDING),
            'preparing_count': sum(1 for b in batches if b.status == TableOrderBatch.Status.PREPARING),
            'batches':         data,
        })


class KitchenBatchUpdateView(APIView):
    """Kitchen marks a batch PREPARING or SERVED."""
    permission_classes = [IsAdminOrBillerOrKitchen]

    # Valid forward-only transitions
    _TRANSITIONS = {
        TableOrderBatch.Status.PENDING:   TableOrderBatch.Status.PREPARING,
        TableOrderBatch.Status.PREPARING: TableOrderBatch.Status.SERVED,
    }

    def patch(self, request, batch_id):
        batch      = get_object_or_404(TableOrderBatch, pk=batch_id)
        new_status = request.data.get('status')
        expected   = self._TRANSITIONS.get(batch.status)

        if new_status != expected:
            return Response(
                {'error': f"Cannot move from {batch.status} to {new_status}. "
                          f"Expected next status: {expected}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        batch.status = new_status
        batch.save(update_fields=['status'])
        return Response(TableOrderBatchSerializer(batch).data)


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
        session = get_object_or_404(
            TableSession.objects.prefetch_related('batches__items__food_item'),
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
                    session=session, added_by=TableOrderBatch.AddedBy.BILLER, notes=batch_notes
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
        return Response(TableOrderBatchSerializer(batch).data, status=status.HTTP_201_CREATED)


class TableSessionBillView(APIView):
    """
    Close an open session: create a PAID Order from all session items,
    link it to the session, and close the session.

    Stock is NOT deducted here — it was deducted at QR submission time (Phase 2).
    The billing signal detects `table_session_id` and skips stock deduction,
    but still creates the Finance income record and Customer visit.
    """
    permission_classes = [IsAdminOrBiller]

    def post(self, request, session_id):
        session = get_object_or_404(
            TableSession, pk=session_id,
            status__in=[TableSession.Status.OPEN, TableSession.Status.CLOSED],
        )

        payment_method = request.data.get('payment_method', 'CASH')
        discount       = request.data.get('discount', 0)
        customer_name  = request.data.get('customer_name', '')
        customer_phone = request.data.get('customer_phone', '')

        # Collect all items from all batches in the session
        all_batch_items = []
        for batch in session.batches.prefetch_related('items__food_item').all():
            for item in batch.items.all():
                all_batch_items.append(item)

        if not all_batch_items:
            return Response({'error': 'No items in this session'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tax_percent = __import__(
                'apps.settings_app.models', fromlist=['RestaurantSettings']
            ).RestaurantSettings.get_settings().gst_rate
        except Exception:
            tax_percent = 5.00

        from apps.billing.models import Order, OrderItem
        from django.utils import timezone

        with transaction.atomic():
            order = Order.objects.create(
                biller         = request.user,
                customer_name  = customer_name,
                customer_phone = customer_phone,
                payment_method = payment_method,
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

            session.discount  = discount
            session.status    = TableSession.Status.BILLED
            session.closed_at = timezone.now()
            session.save(update_fields=['discount', 'status', 'closed_at'])

        # WhatsApp bill notification — non-blocking, never breaks the billing flow
        try:
            from apps.notifications.utils import send_bill_notification
            send_bill_notification(order)
        except Exception:
            pass

        from apps.billing.serializers import OrderSerializer
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


# ── Biller: manually end a session (without billing) ────────────────────────

class TableSessionEndView(APIView):
    """
    Biller closes an open session without generating a bill.
    Sets status → CLOSED and clears session_key so a new party can claim
    the table. The session data stays intact and can still be billed later.
    """
    permission_classes = [IsAdminOrBiller]

    def post(self, request, session_id):
        session = get_object_or_404(TableSession, pk=session_id, status=TableSession.Status.OPEN)
        from django.utils import timezone
        session.status      = TableSession.Status.CLOSED
        session.session_key = ''
        session.closed_at   = timezone.now()
        session.save(update_fields=['status', 'session_key', 'closed_at'])
        return Response({'status': 'closed', 'session_id': session.id})


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
        return Response(TableAdminSerializer(table).data)

    def delete(self, request, table_id):
        table = get_object_or_404(Table, pk=table_id)
        if table.sessions.filter(status=TableSession.Status.OPEN).exists():
            return Response(
                {'error': 'Cannot delete a table with an open session.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        table.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
