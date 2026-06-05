from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, Count
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone
import datetime

from apps.accounts.permissions import IsAdmin
from .models import Transaction, Expense, DailyReport
from .serializers import TransactionSerializer, ExpenseSerializer, DailyReportSerializer


class TransactionViewSet(viewsets.ModelViewSet):
    queryset           = Transaction.objects.all()
    serializer_class   = TransactionSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['tx_type', 'category', 'tx_date']
    search_fields      = ['description', 'reference']
    ordering_fields    = ['tx_date', 'amount', 'created_at']


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset           = Expense.objects.all()
    serializer_class   = ExpenseSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['category', 'expense_date']
    search_fields      = ['title', 'notes']
    ordering_fields    = ['expense_date', 'amount']

    def perform_create(self, serializer):
        expense = serializer.save()
        # Auto-create a transaction record
        Transaction.objects.create(
            tx_type     = 'EXPENSE',
            amount      = expense.amount,
            category    = expense.category,
            description = expense.title,
            reference   = f"expense:{expense.id}",
        )


class DailyReportViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = DailyReport.objects.all()
    serializer_class   = DailyReportSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['report_date']
    ordering_fields    = ['report_date', 'total_sales']


class FinanceSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        today   = timezone.now().date()
        month_start = today.replace(day=1)

        total_income  = Transaction.objects.filter(tx_type='INCOME').aggregate(t=Sum('amount'))['t'] or 0
        total_expense = Transaction.objects.filter(tx_type='EXPENSE').aggregate(t=Sum('amount'))['t'] or 0

        month_income  = Transaction.objects.filter(tx_type='INCOME', tx_date__gte=month_start).aggregate(t=Sum('amount'))['t'] or 0
        month_expense = Transaction.objects.filter(tx_type='EXPENSE', tx_date__gte=month_start).aggregate(t=Sum('amount'))['t'] or 0

        today_income  = Transaction.objects.filter(tx_type='INCOME', tx_date=today).aggregate(t=Sum('amount'))['t'] or 0
        today_expense = Transaction.objects.filter(tx_type='EXPENSE', tx_date=today).aggregate(t=Sum('amount'))['t'] or 0

        # Last 30 days daily breakdown
        thirty_days_ago = today - datetime.timedelta(days=30)
        daily_data = (Transaction.objects
                      .filter(tx_date__gte=thirty_days_ago)
                      .annotate(date=TruncDate('tx_date'))
                      .values('date', 'tx_type')
                      .annotate(total=Sum('amount'))
                      .order_by('date'))

        # Monthly breakdown (last 12 months)
        twelve_months_ago = today - datetime.timedelta(days=365)
        monthly_data = (Transaction.objects
                        .filter(tx_date__gte=twelve_months_ago)
                        .annotate(month=TruncMonth('tx_date'))
                        .values('month', 'tx_type')
                        .annotate(total=Sum('amount'))
                        .order_by('month'))

        # Category breakdown for expenses
        expense_by_category = (Transaction.objects
                                .filter(tx_type='EXPENSE')
                                .values('category')
                                .annotate(total=Sum('amount'))
                                .order_by('-total'))

        return Response({
            'summary': {
                'total_income':   float(total_income),
                'total_expense':  float(total_expense),
                'net_profit':     float(total_income) - float(total_expense),
                'month_income':   float(month_income),
                'month_expense':  float(month_expense),
                'month_profit':   float(month_income) - float(month_expense),
                'today_income':   float(today_income),
                'today_expense':  float(today_expense),
            },
            'daily_chart':       list(daily_data),
            'monthly_chart':     list(monthly_data),
            'expense_breakdown': list(expense_by_category),
        })
