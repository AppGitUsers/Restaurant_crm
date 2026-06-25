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
        serializer.save(biller=self.request.user)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        order = self.get_object()
        if order.status != 'PENDING':
            return Response({'error': 'Only pending orders can be confirmed.'}, status=400)
        order.status = 'CONFIRMED'
        order.save()
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        order          = self.get_object()
        payment_method = request.data.get('payment_method', order.payment_method)
        if order.status == 'PAID':
            return Response({'error': 'Order is already paid.'}, status=400)
        if order.status == 'CANCELLED':
            return Response({'error': 'Cannot pay a cancelled order.'}, status=400)
        order.payment_method = payment_method
        order.status         = 'PAID'
        order.save()  # triggers billing/signals.py → handle_order_paid → creates income Transaction

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
            return Response({'error': 'Cannot cancel a paid order.'}, status=400)
        order.status = 'CANCELLED'
        order.save()
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=['get'])
    def bill_pdf(self, request, pk=None):
        from django.http import HttpResponse
        order    = self.get_object()
        pdf_data = generate_bill_pdf(order)
        response = HttpResponse(pdf_data, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="bill_{order.order_number}.pdf"'
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
