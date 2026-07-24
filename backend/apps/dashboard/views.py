import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Sum, Count, Avg, Case, When, F, Value, CharField, ExpressionWrapper, DecimalField
from django.utils import timezone
import datetime

from apps.accounts.permissions import IsAdmin, IsAdminOrBiller

logger = logging.getLogger(__name__)


class DashboardSummaryView(APIView):
    permission_classes = [IsAdminOrBiller]

    def get(self, request):
        from apps.billing.models import Order
        from apps.finance.models import Transaction
        from apps.inventory.models import Stock
        from apps.staff.models import Employee, Attendance
        from apps.customers.models import Customer
        from apps.menu.models import FoodItem

        today       = timezone.now().date()
        month_start = today.replace(day=1)
        week_start  = today - datetime.timedelta(days=today.weekday())

        # ── Orders ──────────────────────────────────────────────
        today_orders      = Order.objects.filter(status='PAID', created_at__date=today)
        today_revenue     = today_orders.aggregate(t=Sum('total_amount'))['t'] or 0
        today_order_count = today_orders.count()

        month_orders  = Order.objects.filter(status='PAID', created_at__date__gte=month_start)
        month_revenue = month_orders.aggregate(t=Sum('total_amount'))['t'] or 0

        # ── Finance ─────────────────────────────────────────────
        month_expense = Transaction.objects.filter(
            tx_type='EXPENSE', tx_date__gte=month_start
        ).aggregate(t=Sum('amount'))['t'] or 0

        # ── Inventory ───────────────────────────────────────────
        low_stock_count = sum(1 for s in Stock.objects.select_related('ingredient').all() if s.is_low)

        # ── Staff ───────────────────────────────────────────────
        total_staff   = Employee.objects.filter(is_active=True).count()
        present_today = Attendance.objects.filter(date=today, status='PRESENT').count()

        # ── Customers ───────────────────────────────────────────
        total_customers    = Customer.objects.count()
        high_val_customers = Customer.objects.filter(frequency_tag='HIGH').count()

        # ── Top selling items (all time) ─────────────────────────
        from apps.tables.models import TableOrderItem
        from django.db.models import Q
        top_items = (TableOrderItem.objects
                     .filter(
                         cancelled_by_kitchen=False,
                     )
                     .filter(
                         Q(batch__billing_order__status='PAID') |
                         Q(batch__session__status='BILLED')
                     )
                     .annotate(
                         display_name=Case(
                             When(food_item__isnull=False, then=F('food_item__name')),
                             default=F('custom_name'),
                             output_field=CharField(),
                         ),
                         display_type=Case(
                             When(food_item__isnull=False, then=F('food_item__food_type__name')),
                             default=Value('Custom'),
                             output_field=CharField(),
                         ),
                     )
                     .values('display_name', 'display_type')
                     .annotate(
                         total_qty=Sum('quantity'),
                         total_revenue=Sum(
                             ExpressionWrapper(
                                 F('quantity') * (F('unit_price') + F('addon_unit_price')),
                                 output_field=DecimalField(max_digits=12, decimal_places=2),
                             )
                         ),
                     )
                     .order_by('-total_qty')[:10])

        # ── Low makeable items ────────────────────────────────────
        low_makeable = FoodItem.objects.filter(
            is_active=True, makeable_count__lt=5
        ).values('name', 'makeable_count', 'food_type__name').order_by('makeable_count')[:10]

        # ── Top customers ─────────────────────────────────────────
        top_customers = Customer.objects.order_by('-total_visits')[:10].values(
            'name', 'phone', 'total_visits', 'total_spent', 'frequency_tag'
        )

        # ── Attendance top performers ─────────────────────────────
        thirty_days_ago = today - datetime.timedelta(days=30)
        top_attendance = (Attendance.objects
                          .filter(date__gte=thirty_days_ago, status='PRESENT')
                          .values('employee__name')
                          .annotate(days=Count('id'))
                          .order_by('-days')[:5])

        if low_stock_count:
            logger.warning("Dashboard: %d low-stock ingredients detected", low_stock_count)

        return Response({
            'today': {
                'revenue':     float(today_revenue),
                'order_count': today_order_count,
                'date':        str(today),
            },
            'month': {
                'revenue':       float(month_revenue),
                'expense':       float(month_expense),
                'profit':        float(month_revenue) - float(month_expense),
                'order_count':   month_orders.count(),
            },
            'inventory': {
                'low_stock_count': low_stock_count,
            },
            'staff': {
                'total':         total_staff,
                'present_today': present_today,
            },
            'customers': {
                'total':      total_customers,
                'high_value': high_val_customers,
            },
            'top_selling_items':  list(top_items),
            'low_makeable_items': list(low_makeable),
            'top_customers':      list(top_customers),
            'top_attendance':     list(top_attendance),
        })
