from django.db import models
from apps.menu.models import FoodItem
from apps.accounts.models import CustomUser


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING   = 'PENDING',   'Pending'
        CONFIRMED = 'CONFIRMED', 'Confirmed'
        PAID      = 'PAID',      'Paid'
        CANCELLED = 'CANCELLED', 'Cancelled'

    class PaymentMethod(models.TextChoices):
        CASH   = 'CASH',   'Cash'
        UPI    = 'UPI',    'UPI'
        CARD   = 'CARD',   'Card'
        OTHER  = 'OTHER',  'Other'

    order_number     = models.CharField(max_length=20, unique=True, blank=True)
    biller           = models.ForeignKey(CustomUser, on_delete=models.SET_NULL,
                                          null=True, related_name='orders_billed')
    customer_name    = models.CharField(max_length=200, blank=True)
    customer_phone   = models.CharField(max_length=15, blank=True)
    status           = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    payment_method   = models.CharField(max_length=10, choices=PaymentMethod.choices,
                                         default=PaymentMethod.CASH)
    subtotal         = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount         = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_percent      = models.DecimalField(max_digits=5, decimal_places=2, default=5.00)
    tax_amount       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_amount     = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes            = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.order_number:
            import datetime
            today   = datetime.date.today()
            prefix  = f"ORD{today.strftime('%Y%m%d')}"
            last    = Order.objects.filter(order_number__startswith=prefix).count()
            self.order_number = f"{prefix}{str(last + 1).zfill(4)}"
        super().save(*args, **kwargs)

    def recalculate_totals(self):
        self.subtotal   = sum(item.line_total for item in self.items.all())
        self.tax_amount = (self.subtotal - self.discount) * (self.tax_percent / 100)
        self.total_amount = self.subtotal - self.discount + self.tax_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total_amount'])

    def __str__(self):
        return f"{self.order_number} — ₹{self.total_amount} ({self.status})"


class OrderItem(models.Model):
    order            = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    food_item        = models.ForeignKey(FoodItem, on_delete=models.PROTECT)
    quantity         = models.PositiveIntegerField(default=1)
    unit_price       = models.DecimalField(max_digits=10, decimal_places=2)
    addon_unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes            = models.TextField(blank=True)

    @property
    def line_total(self):
        return self.quantity * (self.unit_price + self.addon_unit_price)

    def __str__(self):
        return f"{self.food_item.name} × {self.quantity}"
