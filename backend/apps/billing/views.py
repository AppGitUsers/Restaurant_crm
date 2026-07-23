import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from apps.accounts.permissions import IsAdmin, IsAdminOrBiller
from .models import Order, OrderItem
from .serializers import OrderSerializer, OrderCreateSerializer
from utils.pdf_generator import generate_bill_pdf

logger = logging.getLogger(__name__)


def _deduct_packaging_for_order(order):
    """Deduct packaging items based on order_type for every OrderItem in the order."""
    from django.db.models import F
    from apps.inventory.models import PackagingItem, FoodTypePackaging

    deductions = {}  # {packaging_item_id: total_qty_to_deduct}
    for oi in order.items.select_related('food_item__food_type').all():
        fi = oi.food_item
        if not fi or not fi.food_type_id:
            continue
        for mapping in FoodTypePackaging.objects.filter(
            food_type_id=fi.food_type_id,
            order_type=order.order_type,
        ):
            pkg_id = mapping.packaging_item_id
            deductions[pkg_id] = deductions.get(pkg_id, 0) + mapping.qty_per_serving * oi.quantity

    if not deductions:
        logger.debug("_deduct_packaging_for_order: no packaging mappings matched order=%s type=%s",
                     order.order_number, order.order_type)
        return

    pkg_names = {p.id: p.name for p in PackagingItem.objects.filter(pk__in=deductions.keys())}
    for pkg_id, qty in deductions.items():
        PackagingItem.objects.filter(pk=pkg_id).update(
            current_quantity=F('current_quantity') - qty
        )
        logger.info("Packaging deducted: order=%s type=%s item=%s qty=%d",
                    order.order_number, order.order_type, pkg_names.get(pkg_id, pkg_id), qty)


class OrderViewSet(viewsets.ModelViewSet):
    queryset = (Order.objects
                .select_related('biller')
                .prefetch_related('items__food_item__food_type')
                .all())
    filterset_fields = ['status', 'payment_method', 'biller']
    search_fields    = ['order_number', 'customer_name', 'customer_phone']
    ordering_fields  = ['created_at', 'total_amount']

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'confirm', 'pay', 'bill_pdf']:
            return [IsAdminOrBiller()]
        return [IsAdmin()]

    def get_serializer_class(self):
        if self.action == 'create':
            return OrderCreateSerializer
        return OrderSerializer

    def perform_create(self, serializer):
        order = serializer.save(biller=self.request.user)
        logger.info("Order created: biller=%s order=%s customer=%s total=%.2f method=%s",
                    self.request.user, order.order_number,
                    order.customer_name or 'Walk-in', float(order.total_amount), order.payment_method)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        order = self.get_object()
        if order.status != 'PENDING':
            logger.warning("Order confirm blocked: biller=%s order=%s current_status=%s",
                           request.user, order.order_number, order.status)
            return Response({'error': 'Only pending orders can be confirmed.'}, status=400)
        order.status = 'CONFIRMED'
        order.save()
        logger.info("Order confirmed: biller=%s order=%s", request.user, order.order_number)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        order          = self.get_object()
        payment_method = request.data.get('payment_method', order.payment_method)
        if order.status == 'PAID':
            logger.warning("Pay blocked (already paid): biller=%s order=%s", request.user, order.order_number)
            return Response({'error': 'Order is already paid.'}, status=400)
        if order.status == 'CANCELLED':
            logger.warning("Pay blocked (cancelled): biller=%s order=%s", request.user, order.order_number)
            return Response({'error': 'Cannot pay a cancelled order.'}, status=400)
        order.payment_method = payment_method
        order.status         = 'PAID'
        order.save()  # triggers billing/signals.py → handle_order_paid → creates income Transaction
        _deduct_packaging_for_order(order)
        logger.info("Order paid: biller=%s order=%s method=%s total=%.2f type=%s",
                    request.user, order.order_number, payment_method,
                    float(order.total_amount), order.order_type)

        # Counter order → create kitchen batch so kitchen sees it
        if not order.table_session_id:
            try:
                from apps.tables.models import TableOrderBatch, TableOrderItem
                batch = TableOrderBatch.objects.create(
                    billing_order=order,
                    added_by=TableOrderBatch.AddedBy.BILLER,
                    notes=order.notes or '',
                )
                for bi in order.items.select_related('food_item').all():
                    TableOrderItem.objects.create(
                        batch            = batch,
                        food_item        = bi.food_item,
                        custom_name      = bi.custom_name or '',
                        quantity         = bi.quantity,
                        unit_price       = bi.unit_price,
                        addon_unit_price = bi.addon_unit_price,
                        notes            = bi.notes or '',
                    )
                logger.info("Kitchen batch created for counter order: order=%s batch=%d",
                            order.order_number, batch.id)
            except Exception:
                logger.exception("Failed to create kitchen batch for counter order=%s", order.order_number)

        # WhatsApp bill notification (non-blocking — never breaks the payment flow)
        try:
            from apps.notifications.utils import send_bill_notification
            send_bill_notification(order)
        except Exception:
            pass

        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status == 'PAID':
            logger.warning("Cancel blocked (paid): biller=%s order=%s", request.user, order.order_number)
            return Response({'error': 'Cannot cancel a paid order.'}, status=400)
        prev_status  = order.status
        order.status = 'CANCELLED'
        order.save()
        logger.info("Order cancelled: biller=%s order=%s prev_status=%s",
                    request.user, order.order_number, prev_status)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['get'])
    def bill_pdf(self, request, pk=None):
        from django.http import HttpResponse
        order    = self.get_object()
        pdf_data = generate_bill_pdf(order)
        response = HttpResponse(pdf_data, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="bill_{order.order_number}.pdf"'
        logger.info("Bill PDF downloaded: user=%s order=%s", request.user, order.order_number)
        return response


class PublicReceiptView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, share_token):
        order = get_object_or_404(
            Order.objects
            .select_related('biller', 'table_session__table')
            .prefetch_related('items__food_item'),
            share_token=share_token,
            status=Order.Status.PAID,
        )
        from apps.settings_app.models import RestaurantSettings
        settings = RestaurantSettings.get_settings()
        data = OrderSerializer(order).data
        data['restaurant_name'] = settings.company_name
        data['table_number'] = (
            order.table_session.table.number
            if order.table_session_id and order.table_session
            else None
        )
        return Response(data)
