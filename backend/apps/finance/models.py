from django.db import models


class Transaction(models.Model):
    class TxType(models.TextChoices):
        INCOME  = 'INCOME',  'Income'
        EXPENSE = 'EXPENSE', 'Expense'

    class Category(models.TextChoices):
        SALE           = 'SALE',           'Food Sale'
        VENDOR_PAYMENT = 'VENDOR_PAYMENT', 'Vendor Payment'
        STAFF_SALARY   = 'STAFF_SALARY',   'Staff Salary'
        UTILITIES      = 'UTILITIES',      'Utilities'
        RENT           = 'RENT',           'Rent'
        MAINTENANCE    = 'MAINTENANCE',    'Maintenance'
        MISC           = 'MISC',           'Miscellaneous'

    tx_type     = models.CharField(max_length=10, choices=TxType.choices)
    amount      = models.DecimalField(max_digits=12, decimal_places=2)
    category    = models.CharField(max_length=30, choices=Category.choices, default=Category.MISC)
    description = models.TextField(blank=True)
    reference   = models.CharField(max_length=200, blank=True)
    tx_date     = models.DateField(auto_now_add=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.tx_type} ₹{self.amount} — {self.category} ({self.tx_date})"


class Expense(models.Model):
    """Manual expense entries not tied to a vendor invoice."""
    category    = models.CharField(max_length=30,
                                    choices=Transaction.Category.choices,
                                    default=Transaction.Category.MISC)
    title       = models.CharField(max_length=200)
    amount      = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    notes       = models.TextField(blank=True)
    receipt     = models.FileField(upload_to='finance/receipts/', blank=True, null=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-expense_date']

    def __str__(self):
        return f"{self.title} ₹{self.amount} ({self.expense_date})"


class DailyReport(models.Model):
    report_date    = models.DateField(unique=True)
    total_sales    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_expenses = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_orders   = models.IntegerField(default=0)
    net_profit     = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-report_date']

    def __str__(self):
        return f"Report {self.report_date} | Sales: ₹{self.total_sales}"
