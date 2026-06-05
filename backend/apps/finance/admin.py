from django.contrib import admin
from .models import Transaction, Expense, DailyReport

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display  = ['tx_type', 'category', 'amount', 'tx_date', 'description']
    list_filter   = ['tx_type', 'category', 'tx_date']
    search_fields = ['description', 'reference']

@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display  = ['title', 'category', 'amount', 'expense_date']
    list_filter   = ['category', 'expense_date']
    search_fields = ['title']

@admin.register(DailyReport)
class DailyReportAdmin(admin.ModelAdmin):
    list_display = ['report_date', 'total_sales', 'total_expenses', 'net_profit', 'total_orders']
