from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import VendorViewSet, StockViewSet, VendorInvoiceViewSet, StockTransactionViewSet

router = DefaultRouter()
router.register('vendors',      VendorViewSet,          basename='vendor')
router.register('stock',        StockViewSet,           basename='stock')
router.register('invoices',     VendorInvoiceViewSet,   basename='invoice')
router.register('transactions', StockTransactionViewSet, basename='stock-tx')

urlpatterns = [path('', include(router.urls))]
