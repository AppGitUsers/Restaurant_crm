from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TransactionViewSet, ExpenseViewSet, DailyReportViewSet, FinanceSummaryView

router = DefaultRouter()
router.register('transactions', TransactionViewSet, basename='transaction')
router.register('expenses',     ExpenseViewSet,     basename='expense')
router.register('reports',      DailyReportViewSet, basename='daily-report')

urlpatterns = [
    path('', include(router.urls)),
    path('summary/', FinanceSummaryView.as_view(), name='finance-summary'),
]
