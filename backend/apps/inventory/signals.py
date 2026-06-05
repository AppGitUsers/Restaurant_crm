from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import InvoicePayment, VendorInvoice, Stock, StockTransaction


@receiver(post_save, sender=InvoicePayment)
def handle_invoice_payment(sender, instance, created, **kwargs):
    """Update invoice paid_amount + status when a payment is recorded."""
    if not created:
        return
    invoice = instance.invoice
    invoice.paid_amount = sum(p.amount for p in invoice.payments.all())
    invoice.recalculate_status()
    invoice.save(update_fields=['paid_amount', 'status'])

    # Record expense in finance
    try:
        from apps.finance.models import Transaction
        Transaction.objects.create(
            tx_type     = 'EXPENSE',
            amount      = instance.amount,
            category    = 'VENDOR_PAYMENT',
            description = f"Vendor payment: {invoice.invoice_number} — {invoice.vendor.name}",
            reference   = f"invoice:{invoice.id}",
        )
    except Exception:
        pass


@receiver(post_save, sender=VendorInvoice)
def push_stock_on_receive(sender, instance, **kwargs):
    """When stock_updated is flipped to True, add all invoice items to inventory."""
    if not instance.stock_updated:
        return

    # Check if we already processed (avoid re-runs on unrelated saves)
    already_processed = StockTransaction.objects.filter(
        reference=f"invoice:{instance.invoice_number}"
    ).exists()
    if already_processed:
        return

    for item in instance.items.select_related('ingredient').all():
        stock, _ = Stock.objects.get_or_create(ingredient=item.ingredient)
        stock.current_quantity += item.quantity
        stock.save(update_fields=['current_quantity'])

        StockTransaction.objects.create(
            ingredient = item.ingredient,
            tx_type    = 'IN',
            quantity   = item.quantity,
            reference  = f"invoice:{instance.invoice_number}",
            note       = f"Received from {instance.vendor.name}",
        )

    # Recalculate makeable counts for all food items
    try:
        from apps.menu.models import FoodItem
        for food in FoodItem.objects.filter(is_active=True):
            food.update_makeable_count()
    except Exception:
        pass
