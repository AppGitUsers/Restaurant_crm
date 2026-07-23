from django.db import models
from apps.menu.models import Ingredient


class Vendor(models.Model):
    name         = models.CharField(max_length=200)
    contact_name = models.CharField(max_length=200, blank=True)
    phone        = models.CharField(max_length=15)
    email        = models.EmailField(blank=True)
    address      = models.TextField(blank=True)
    gstin        = models.CharField(max_length=20, blank=True)
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Stock(models.Model):
    ingredient        = models.OneToOneField(Ingredient, on_delete=models.PROTECT, related_name='stock')
    current_quantity  = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    minimum_threshold = models.DecimalField(max_digits=12, decimal_places=3, default=0,
                                             help_text='Alert when stock falls below this level')
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['ingredient__name']

    def __str__(self):
        return f"{self.ingredient.name}: {self.current_quantity} {self.ingredient.unit}"

    @property
    def is_low(self):
        return self.current_quantity <= self.minimum_threshold


class VendorInvoice(models.Model):
    class Status(models.TextChoices):
        UNPAID  = 'UNPAID',  'Unpaid'
        PARTIAL = 'PARTIAL', 'Partial'
        PAID    = 'PAID',    'Paid'

    vendor          = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name='invoices')
    invoice_number  = models.CharField(max_length=100, unique=True, blank=True, null=True)
    invoice_date    = models.DateField()
    due_date        = models.DateField(null=True, blank=True)
    total_amount    = models.DecimalField(max_digits=12, decimal_places=2)
    extra_charges   = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                          help_text='GST, delivery, or other additional charges')
    paid_amount     = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status          = models.CharField(max_length=10, choices=Status.choices, default=Status.UNPAID)
    notes           = models.TextField(blank=True)
    stock_updated   = models.BooleanField(default=False,
                                           help_text='True once items have been added to inventory')
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-invoice_date']

    @property
    def balance_due(self):
        return self.total_amount - self.paid_amount

    def recalculate_status(self):
        if self.paid_amount >= self.total_amount:
            self.status = self.Status.PAID
        elif self.paid_amount > 0:
            self.status = self.Status.PARTIAL
        else:
            self.status = self.Status.UNPAID

    def __str__(self):
        return f"{self.invoice_number} — {self.vendor.name} ({self.status})"


class PackagingItem(models.Model):
    name                = models.CharField(max_length=200, unique=True)
    unit                = models.CharField(max_length=50, default='pcs')
    current_quantity    = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=0)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.current_quantity} {self.unit})"

    @property
    def is_low(self):
        return self.current_quantity <= self.low_stock_threshold


class FoodTypePackaging(models.Model):
    class OrderType(models.TextChoices):
        DINE_IN = 'DINE_IN', 'Dine In'
        PARCEL  = 'PARCEL',  'Parcel'

    food_type       = models.ForeignKey('menu.FoodType', on_delete=models.CASCADE,
                                        related_name='packaging_mappings')
    packaging_item  = models.ForeignKey(PackagingItem, on_delete=models.CASCADE,
                                        related_name='food_type_mappings')
    order_type      = models.CharField(max_length=10, choices=OrderType.choices)
    qty_per_serving = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ['food_type', 'packaging_item', 'order_type']
        ordering        = ['food_type__name', 'order_type']

    def __str__(self):
        return (f"{self.food_type.name} → {self.packaging_item.name} "
                f"×{self.qty_per_serving} ({self.order_type})")


class InvoiceItem(models.Model):
    invoice         = models.ForeignKey(VendorInvoice, on_delete=models.CASCADE, related_name='items')
    ingredient      = models.ForeignKey(Ingredient, on_delete=models.PROTECT,
                                        null=True, blank=True)
    packaging_item  = models.ForeignKey(PackagingItem, on_delete=models.PROTECT,
                                        null=True, blank=True)
    quantity        = models.DecimalField(max_digits=12, decimal_places=3,
                                          help_text='Number of packages purchased')
    qty_per_package = models.DecimalField(max_digits=12, decimal_places=3, default=1,
                                          help_text='Units per package (e.g. 500 ml per bottle)')
    unit_price      = models.DecimalField(max_digits=10, decimal_places=2,
                                          help_text='Price per package')

    @property
    def stock_quantity(self):
        return self.quantity * self.qty_per_package

    @property
    def line_total(self):
        return self.quantity * self.unit_price

    def __str__(self):
        if self.ingredient_id:
            return f"{self.ingredient.name} × {self.quantity}"
        if self.packaging_item_id:
            return f"{self.packaging_item.name} × {self.quantity}"
        return f"? × {self.quantity}"


class InvoicePayment(models.Model):
    invoice        = models.ForeignKey(VendorInvoice, on_delete=models.CASCADE, related_name='payments')
    amount         = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date   = models.DateField()
    payment_method = models.CharField(max_length=50, default='Cash',
                                       choices=[('Cash','Cash'),('UPI','UPI'),
                                                ('Bank Transfer','Bank Transfer'),('Cheque','Cheque')])
    notes          = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date']

    def __str__(self):
        return f"₹{self.amount} on {self.payment_date} for {self.invoice.invoice_number}"


class StockTransaction(models.Model):
    class TxType(models.TextChoices):
        IN     = 'IN',     'Stock In'
        OUT    = 'OUT',    'Stock Out'
        ADJUST = 'ADJUST', 'Manual Adjustment'

    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='transactions')
    tx_type    = models.CharField(max_length=10, choices=TxType.choices)
    quantity   = models.DecimalField(max_digits=12, decimal_places=3)
    reference  = models.CharField(max_length=200, blank=True)
    note       = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.tx_type} {self.quantity} {self.ingredient.name}"
