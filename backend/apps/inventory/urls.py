from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (VendorViewSet, StockViewSet, VendorInvoiceViewSet,
                    StockTransactionViewSet, PackagingItemViewSet,
                    FoodTypePackagingViewSet, RawMaterialViewSet)

router = DefaultRouter()
router.register('vendors',           VendorViewSet,           basename='vendor')
router.register('stock',             StockViewSet,            basename='stock')
router.register('invoices',          VendorInvoiceViewSet,    basename='invoice')
router.register('transactions',      StockTransactionViewSet, basename='stock-tx')
router.register('packaging',         PackagingItemViewSet,    basename='packaging')
router.register('food-type-mapping', FoodTypePackagingViewSet, basename='food-type-packaging')
router.register('raw-materials',     RawMaterialViewSet,      basename='raw-material')

urlpatterns = [path('', include(router.urls))]
