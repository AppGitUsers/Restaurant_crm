from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TransactionViewSet, ExpenseViewSet, DailyReportViewSet, FinanceSummaryView, MonthlyReportView, MonthlyDataView

router = DefaultRouter()
router.register('transactions', TransactionViewSet, basename='transaction')
router.register('expenses',     ExpenseViewSet,     basename='expense')
router.register('reports',      DailyReportViewSet, basename='daily-report')

urlpatterns = [
    path('', include(router.urls)),
    path('summary/',        FinanceSummaryView.as_view(),  name='finance-summary'),
    path('monthly_report/', MonthlyReportView.as_view(),   name='finance-monthly-report'),
    path('monthly_data/',   MonthlyDataView.as_view(),     name='finance-monthly-data'),
]
