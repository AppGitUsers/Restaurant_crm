import logging
from django.db.models.signals import post_save
from django.db.models import Sum, F
from django.dispatch import receiver
from .models import InvoicePayment, VendorInvoice, Stock, StockTransaction

logger = logging.getLogger(__name__)


@receiver(post_save, sender=InvoicePayment)
def handle_invoice_payment(sender, instance, created, **kwargs):
    """Update invoice paid_amount + status when a payment is recorded."""
    if not created:
        return
    invoice = VendorInvoice.objects.get(pk=instance.invoice_id)
    invoice.paid_amount = (InvoicePayment.objects
                           .filter(invoice_id=instance.invoice_id)
                           .aggregate(total=Sum('amount'))['total'] or 0)
    invoice.recalculate_status()
    invoice.save(update_fields=['paid_amount', 'status'])

    try:
        from apps.finance.models import Transaction
        Transaction.objects.create(
            tx_type     = 'EXPENSE',
            amount      = instance.amount,
            category    = 'VENDOR_PAYMENT',
            description = f"Vendor payment: {invoice.invoice_number} — {invoice.vendor.name}",
            reference   = f"invoice:{invoice.id}",
            tx_date     = instance.payment_date,
        )
    except Exception:
        pass


@receiver(post_save, sender=VendorInvoice)
def push_stock_on_receive(sender, instance, **kwargs):
    """When stock_updated is flipped to True via mark_received, add items to inventory."""
    if not instance.stock_updated:
        return

    # Only process when 'stock_updated' is explicitly in the saved fields.
    # mark_received uses save(update_fields=['stock_updated']), so this guard prevents
    # accidental re-processing on unrelated saves of an already-received invoice.
    update_fields = kwargs.get('update_fields')
    if update_fields is not None and 'stock_updated' not in update_fields:
        return

    items = list(instance.items.select_related('ingredient', 'packaging_item', 'raw_material').all())
    if not items:
        return

    from .models import PackagingItem, RawMaterial

    for item in items:
        stock_qty = item.quantity * item.qty_per_package

        if item.ingredient_id:
            stock, _ = Stock.objects.get_or_create(
                ingredient=item.ingredient,
                defaults={'current_quantity': 0, 'minimum_threshold': 0},
            )
            stock.current_quantity += stock_qty
            stock.save(update_fields=['current_quantity'])

            StockTransaction.objects.create(
                ingredient = item.ingredient,
                tx_type    = 'IN',
                quantity   = stock_qty,
                reference  = f"invoice:{instance.invoice_number}",
                note       = f"Received from {instance.vendor.name}",
            )

        elif item.packaging_item_id:
            PackagingItem.objects.filter(pk=item.packaging_item_id).update(
                current_quantity=F('current_quantity') + int(stock_qty)
            )
            logger.info("PackagingItem restocked via invoice: invoice=%s item=%s qty_added=%d",
                        instance.invoice_number, item.packaging_item.name, int(stock_qty))

        elif item.raw_material_id:
            RawMaterial.objects.filter(pk=item.raw_material_id).update(
                current_quantity=F('current_quantity') + stock_qty
            )
            logger.info("RawMaterial restocked via invoice: invoice=%s item=%s qty_added=%s unit=%s",
                        instance.invoice_number, item.raw_material.name,
                        stock_qty, item.raw_material.unit)

    # Two-pass recalc: components first, then combos
    try:
        from apps.menu.models import FoodItem
        for food in FoodItem.objects.filter(is_active=True, is_combo=False):
            food.update_makeable_count()
        for food in FoodItem.objects.filter(is_active=True, is_combo=True):
            food.update_makeable_count()
    except Exception:
        pass
