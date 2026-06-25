import datetime
import uuid
from django.db import models, transaction as db_transaction
from apps.menu.models import FoodItem
from apps.accounts.models import CustomUser


class OrderCounter(models.Model):
    """One row per calendar day — atomically tracks how many orders exist that day."""
    date  = models.DateField(unique=True)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = []


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
    share_token      = models.UUIDField(default=uuid.uuid4, unique=True)
    table_session    = models.OneToOneField(
        'tables.TableSession',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='order',
    )
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.order_number:
            today   = datetime.date.today()
            prefix  = f"ORD{today.strftime('%Y%m%d')}"
            with db_transaction.atomic():
                counter, _ = OrderCounter.objects.select_for_update().get_or_create(
                    date=today, defaults={'count': 0}
                )
                counter.count += 1
                counter.save(update_fields=['count'])
                self.order_number = f"{prefix}{str(counter.count).zfill(4)}"
        super().save(*args, **kwargs)

    def recalculate_totals(self):
        self.subtotal     = sum(item.line_total for item in self.items.all())
        taxable           = max(0, self.subtotal - self.discount)
        self.tax_amount   = taxable * (self.tax_percent / 100)
        self.total_amount = taxable + self.tax_amount
        self.save(update_fields=['subtotal', 'tax_amount', 'total_amount'])

    def __str__(self):
        return f"{self.order_number} — ₹{self.total_amount} ({self.status})"


class OrderItem(models.Model):
    order            = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    food_item        = models.ForeignKey(FoodItem, on_delete=models.PROTECT, null=True, blank=True)
    custom_name      = models.CharField(max_length=500, blank=True)
    quantity         = models.PositiveIntegerField(default=1)
    unit_price       = models.DecimalField(max_digits=10, decimal_places=2)
    addon_unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes            = models.TextField(blank=True)

    @property
    def line_total(self):
        return self.quantity * (self.unit_price + self.addon_unit_price)

    def __str__(self):
        label = self.custom_name or (self.food_item.name if self.food_item else 'Custom')
        return f"{label} × {self.quantity}"
