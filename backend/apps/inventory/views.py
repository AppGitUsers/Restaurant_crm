from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.accounts.permissions import IsAdmin, IsAdminOrBiller
from .models import Vendor, Stock, VendorInvoice, InvoicePayment, StockTransaction
from .serializers import (VendorSerializer, StockSerializer, VendorInvoiceSerializer,
                           VendorInvoiceWriteSerializer, InvoicePaymentSerializer,
                           StockTransactionSerializer)


class VendorViewSet(viewsets.ModelViewSet):
    queryset           = Vendor.objects.all()
    serializer_class   = VendorSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['is_active']
    search_fields      = ['name', 'contact_name', 'phone', 'email']
    ordering_fields    = ['name', 'created_at']


class StockViewSet(viewsets.ModelViewSet):
    queryset           = Stock.objects.select_related('ingredient').all()
    serializer_class   = StockSerializer
    permission_classes = [IsAdmin]
    search_fields      = ['ingredient__name']
    ordering_fields    = ['ingredient__name', 'current_quantity']

    @action(detail=False, methods=['get'])
    def low_stock_alert(self, request):
        low = [s for s in self.get_queryset() if s.is_low]
        return Response(StockSerializer(low, many=True).data)

    @action(detail=True, methods=['post'])
    def manual_adjust(self, request, pk=None):
        stock    = self.get_object()
        quantity = request.data.get('quantity')
        note     = request.data.get('note', 'Manual adjustment')
        if quantity is None:
            return Response({'error': 'quantity is required'}, status=400)
        old_qty = stock.current_quantity
        stock.current_quantity = quantity
        stock.save()
        StockTransaction.objects.create(
            ingredient = stock.ingredient,
            tx_type    = 'ADJUST',
            quantity   = abs(float(quantity) - float(old_qty)),
            note       = note,
        )
        from apps.menu.models import FoodItem
        for food in FoodItem.objects.filter(is_active=True):
            food.update_makeable_count()
        return Response(StockSerializer(stock).data)


class VendorInvoiceViewSet(viewsets.ModelViewSet):
    queryset = (VendorInvoice.objects
                .select_related('vendor')
                .prefetch_related('items__ingredient', 'payments')
                .all())
    permission_classes = [IsAdmin]
    filterset_fields   = ['status', 'vendor', 'stock_updated']
    search_fields      = ['invoice_number', 'vendor__name']
    ordering_fields    = ['invoice_date', 'total_amount', 'created_at']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return VendorInvoiceWriteSerializer
        return VendorInvoiceSerializer

    @action(detail=True, methods=['post'])
    def mark_received(self, request, pk=None):
        invoice = self.get_object()
        if invoice.stock_updated:
            return Response({'detail': 'Stock already updated for this invoice.'}, status=400)
        invoice.stock_updated = True
        invoice.save()
        return Response({'detail': 'Stock updated from invoice.'})

    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        invoice = self.get_object()
        data    = {**request.data, 'invoice': invoice.id}
        serializer = InvoicePaymentSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save(invoice=invoice)
        # Re-fetch invoice fresh to pick up signal-updated paid_amount/status and new payment row
        invoice = (VendorInvoice.objects
                   .select_related('vendor')
                   .prefetch_related('items__ingredient', 'payments')
                   .get(pk=invoice.pk))
        return Response(VendorInvoiceSerializer(invoice).data, status=201)


class StockTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (StockTransaction.objects
                .select_related('ingredient')
                .order_by('-created_at'))
    serializer_class   = StockTransactionSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['tx_type', 'ingredient']
    search_fields      = ['ingredient__name', 'reference', 'note']
