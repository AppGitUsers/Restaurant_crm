import uuid
from django.db import models


class Table(models.Model):
    number               = models.PositiveIntegerField(unique=True)
    qr_token             = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    is_active            = models.BooleanField(default=True)
    is_accepting_orders  = models.BooleanField(default=False,
                               help_text='Biller must open the table before customers can order')

    class Meta:
        ordering = ['number']

    def __str__(self):
        return f"Table {self.number}"

    def get_active_session(self):
        return self.sessions.filter(status=TableSession.Status.OPEN).first()


class TableSession(models.Model):
    class Status(models.TextChoices):
        OPEN   = 'OPEN',   'Open'
        CLOSED = 'CLOSED', 'Closed'   # ended by biller without billing
        BILLED = 'BILLED', 'Billed'

    table       = models.ForeignKey(Table, on_delete=models.PROTECT, related_name='sessions')
    status      = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    session_key = models.CharField(max_length=64, blank=True, default='')
    opened_at   = models.DateTimeField(auto_now_add=True)
    closed_at   = models.DateTimeField(null=True, blank=True)
    discount    = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ['-opened_at']
        constraints = [
            # PostgreSQL partial unique index: only one OPEN session per table at a time
            models.UniqueConstraint(
                fields=['table'],
                condition=models.Q(status='OPEN'),
                name='unique_open_session_per_table',
            )
        ]

    def __str__(self):
        return f"Table {self.table.number} — {self.status} ({self.opened_at.date()})"

    @property
    def subtotal(self):
        total = sum(
            item.line_total
            for batch in self.batches.prefetch_related('items').all()
            for item in batch.items.all()
            if not item.cancelled_by_kitchen
        )
        return total

    @property
    def item_count(self):
        return sum(
            item.quantity
            for batch in self.batches.prefetch_related('items').all()
            for item in batch.items.all()
            if not item.cancelled_by_kitchen
        )


class TableOrderBatch(models.Model):
    class Status(models.TextChoices):
        PENDING_PAYMENT = 'PENDING_PAYMENT', 'Pending Payment'
        PENDING         = 'PENDING',         'Pending'
        PREPARING       = 'PREPARING',       'Preparing'
        SERVED          = 'SERVED',          'Served'

    class AddedBy(models.TextChoices):
        CUSTOMER = 'CUSTOMER', 'Customer'
        BILLER   = 'BILLER',   'Biller'

    session       = models.ForeignKey(TableSession, on_delete=models.CASCADE, related_name='batches', null=True, blank=True)
    billing_order = models.OneToOneField('billing.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='kitchen_batch')
    status        = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    added_by      = models.CharField(max_length=10, choices=AddedBy.choices, default=AddedBy.CUSTOMER)
    placed_at     = models.DateTimeField(auto_now_add=True)
    served_at     = models.DateTimeField(null=True, blank=True)
    notes         = models.TextField(blank=True)

    class Meta:
        ordering = ['placed_at']

    def __str__(self):
        if self.session_id:
            return f"Batch {self.id} — Table {self.session.table.number} ({self.status})"
        return f"Batch {self.id} — Counter ({self.status})"


class TableOrderItem(models.Model):
    batch                = models.ForeignKey(TableOrderBatch, on_delete=models.CASCADE, related_name='items')
    food_item            = models.ForeignKey('menu.FoodItem', on_delete=models.PROTECT, related_name='table_order_items', null=True, blank=True)
    custom_name          = models.CharField(max_length=200, blank=True)
    quantity             = models.PositiveIntegerField(default=1)
    unit_price           = models.DecimalField(max_digits=10, decimal_places=2)
    addon_unit_price     = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes                = models.TextField(blank=True)
    cancelled_by_kitchen = models.BooleanField(default=False)
    cancelled_at         = models.DateTimeField(null=True, blank=True)

    @property
    def line_total(self):
        return self.quantity * (self.unit_price + self.addon_unit_price)

    def __str__(self):
        name = self.food_item.name if self.food_item_id else (self.custom_name or 'Custom')
        return f"{name} × {self.quantity}"


class KitchenNotification(models.Model):
    session    = models.ForeignKey(TableSession, on_delete=models.CASCADE, related_name='notifications')
    message    = models.TextField()
    is_seen    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Notification for Table {self.session.table.number}: {self.message[:40]}"
