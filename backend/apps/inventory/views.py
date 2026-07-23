import logging
import threading
from decimal import Decimal, InvalidOperation
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.accounts.permissions import IsAdmin, IsAdminOrBiller
from .models import (Vendor, Stock, VendorInvoice, InvoicePayment, StockTransaction,
                     PackagingItem, FoodTypePackaging)
from .serializers import (VendorSerializer, StockSerializer, VendorInvoiceSerializer,
                           VendorInvoiceWriteSerializer, InvoicePaymentSerializer,
                           StockTransactionSerializer, PackagingItemSerializer,
                           FoodTypePackagingSerializer)

logger = logging.getLogger(__name__)


class VendorViewSet(viewsets.ModelViewSet):
    queryset           = Vendor.objects.all()
    serializer_class   = VendorSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['is_active']
    search_fields      = ['name', 'contact_name', 'phone', 'email']
    ordering_fields    = ['name', 'created_at']

    def perform_create(self, serializer):
        vendor = serializer.save()
        logger.info("Vendor created: admin=%s name=%s", self.request.user, vendor.name)

    def perform_update(self, serializer):
        serializer.save()
        logger.info("Vendor updated: admin=%s name=%s fields=%s",
                    self.request.user, serializer.instance.name, list(self.request.data.keys()))

    def perform_destroy(self, instance):
        logger.info("Vendor deleted: admin=%s name=%s", self.request.user, instance.name)
        instance.delete()


class StockViewSet(viewsets.ModelViewSet):
    queryset           = Stock.objects.select_related('ingredient').all()
    serializer_class   = StockSerializer
    permission_classes = [IsAdmin]
    search_fields      = ['ingredient__name']
    ordering_fields    = ['ingredient__name', 'current_quantity']

    @action(detail=False, methods=['get'])
    def low_stock_alert(self, request):
        low = [s for s in self.get_queryset() if s.is_low]
        if low:
            logger.warning("Low stock alert fetched: user=%s items=%d", request.user, len(low))
        return Response(StockSerializer(low, many=True).data)

    @action(detail=True, methods=['post'])
    def manual_adjust(self, request, pk=None):
        stock    = self.get_object()
        quantity = request.data.get('quantity')
        note     = request.data.get('note', 'Manual adjustment')
        if quantity is None:
            return Response({'error': 'quantity is required'}, status=400)
        try:
            quantity = Decimal(str(quantity))
        except (InvalidOperation, ValueError):
            return Response({'error': 'quantity must be a valid number'}, status=400)
        old_qty = stock.current_quantity
        stock.current_quantity = quantity
        stock.save()
        StockTransaction.objects.create(
            ingredient = stock.ingredient,
            tx_type    = 'ADJUST',
            quantity   = abs(float(quantity) - float(old_qty)),
            note       = note,
        )
        logger.info("Stock manually adjusted: admin=%s ingredient=%s old=%.3f new=%.3f note=%s",
                    request.user, stock.ingredient.name, float(old_qty), float(quantity), note)

        def _recalculate():
            from apps.menu.models import FoodItem
            for food in FoodItem.objects.filter(is_active=True, is_combo=False):
                food.update_makeable_count()
            for food in FoodItem.objects.filter(is_active=True, is_combo=True):
                food.update_makeable_count()

        threading.Thread(target=_recalculate, daemon=True).start()
        return Response(StockSerializer(stock).data)


class VendorInvoiceViewSet(viewsets.ModelViewSet):
    queryset = (VendorInvoice.objects
                .select_related('vendor')
                .prefetch_related('items__ingredient', 'items__packaging_item', 'payments')
                .all())
    permission_classes = [IsAdmin]
    filterset_fields   = ['status', 'vendor', 'stock_updated']
    search_fields      = ['invoice_number', 'vendor__name']
    ordering_fields    = ['invoice_date', 'total_amount', 'created_at']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return VendorInvoiceWriteSerializer
        return VendorInvoiceSerializer

    def perform_create(self, serializer):
        invoice = serializer.save()
        logger.info("VendorInvoice created: admin=%s vendor=%s invoice=%s total=%s",
                    self.request.user, invoice.vendor.name, invoice.invoice_number, invoice.total_amount)

    def perform_update(self, serializer):
        serializer.save()
        logger.info("VendorInvoice updated: admin=%s invoice=%s fields=%s",
                    self.request.user, serializer.instance.invoice_number, list(self.request.data.keys()))

    def perform_destroy(self, instance):
        logger.info("VendorInvoice deleted: admin=%s invoice=%s vendor=%s",
                    self.request.user, instance.invoice_number, instance.vendor.name)
        instance.delete()

    @action(detail=True, methods=['post'])
    def mark_received(self, request, pk=None):
        invoice = self.get_object()
        if invoice.stock_updated:
            logger.warning("mark_received blocked (already done): admin=%s invoice=%s",
                           request.user, invoice.invoice_number)
            return Response({'detail': 'Stock already updated for this invoice.'}, status=400)
        invoice.stock_updated = True
        invoice.save(update_fields=['stock_updated'])
        logger.info("Invoice marked received (stock updated): admin=%s invoice=%s vendor=%s",
                    request.user, invoice.invoice_number, invoice.vendor.name)
        return Response({'detail': 'Stock updated from invoice.'})

    @action(detail=True, methods=['post'])
    def add_payment(self, request, pk=None):
        invoice = self.get_object()
        data    = {**request.data, 'invoice': invoice.id}
        serializer = InvoicePaymentSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        payment = serializer.save(invoice=invoice)
        logger.info("Invoice payment added: admin=%s invoice=%s amount=%s method=%s",
                    request.user, invoice.invoice_number,
                    request.data.get('amount', '?'), request.data.get('payment_method', '?'))
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


class PackagingItemViewSet(viewsets.ModelViewSet):
    queryset           = PackagingItem.objects.all()
    serializer_class   = PackagingItemSerializer
    permission_classes = [IsAdmin]
    search_fields      = ['name']
    ordering_fields    = ['name', 'current_quantity']

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        low = [p for p in self.get_queryset() if p.is_low]
        return Response(PackagingItemSerializer(low, many=True).data)

    @action(detail=True, methods=['post'])
    def adjust(self, request, pk=None):
        item     = self.get_object()
        quantity = request.data.get('quantity')
        if quantity is None:
            return Response({'error': 'quantity is required'}, status=400)
        try:
            quantity = int(quantity)
        except (ValueError, TypeError):
            return Response({'error': 'quantity must be an integer'}, status=400)
        item.current_quantity = quantity
        item.save(update_fields=['current_quantity'])
        logger.info("PackagingItem adjusted: admin=%s item=%s new_qty=%d",
                    request.user, item.name, quantity)
        return Response(PackagingItemSerializer(item).data)


class FoodTypePackagingViewSet(viewsets.ModelViewSet):
    queryset = (FoodTypePackaging.objects
                .select_related('food_type', 'packaging_item')
                .all())
    serializer_class   = FoodTypePackagingSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['food_type', 'order_type']
