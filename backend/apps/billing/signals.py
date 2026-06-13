from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Order


@receiver(post_save, sender=Order)
def handle_order_paid(sender, instance, **kwargs):
    """When an order is marked PAID: deduct inventory + record income + update customers."""
    if instance.status != 'PAID':
        return

    # Check if already processed via StockTransaction reference
    from apps.inventory.models import Stock, StockTransaction
    already = StockTransaction.objects.filter(reference=f"order:{instance.order_number}").exists()
    if already:
        return

    # Deduct stock for each order item
    for order_item in instance.items.select_related('food_item').prefetch_related(
        'food_item__combo_components__component__recipe_ingredients__ingredient',
        'food_item__recipe_ingredients__ingredient',
    ).all():
        if not order_item.food_item:
            continue

        food_item = order_item.food_item

        if food_item.is_combo:
            # Deduct each component's recipe ingredients
            for cc in food_item.combo_components.all():
                component = cc.component
                if not component.tracks_stock:
                    continue
                for ri in component.recipe_ingredients.select_related('ingredient').all():
                    stock, _ = Stock.objects.get_or_create(ingredient=ri.ingredient)
                    deduct = ri.quantity_required * order_item.quantity
                    stock.current_quantity = max(0, stock.current_quantity - deduct)
                    stock.save(update_fields=['current_quantity'])
                    StockTransaction.objects.create(
                        ingredient = ri.ingredient,
                        tx_type    = 'OUT',
                        quantity   = deduct,
                        reference  = f"order:{instance.order_number}",
                        note       = f"Sold: {food_item.name} × {order_item.quantity} (via {component.name})",
                    )
            continue

        if not food_item.tracks_stock:
            continue

        for ri in food_item.recipe_ingredients.select_related('ingredient').all():
            stock, _ = Stock.objects.get_or_create(ingredient=ri.ingredient)
            deduct = ri.quantity_required * order_item.quantity
            stock.current_quantity = max(0, stock.current_quantity - deduct)
            stock.save(update_fields=['current_quantity'])
            StockTransaction.objects.create(
                ingredient = ri.ingredient,
                tx_type    = 'OUT',
                quantity   = deduct,
                reference  = f"order:{instance.order_number}",
                note       = f"Sold: {food_item.name} × {order_item.quantity}",
            )

    # Two-pass recalc: components first, then combos (combos read component counts)
    try:
        from apps.menu.models import FoodItem
        for food in FoodItem.objects.filter(is_active=True, is_combo=False):
            food.update_makeable_count()
        for food in FoodItem.objects.filter(is_active=True, is_combo=True):
            food.update_makeable_count()
    except Exception:
        pass

    # Record income in finance
    try:
        from apps.finance.models import Transaction
        Transaction.objects.get_or_create(
            reference=f"order:{instance.order_number}",
            defaults=dict(
                tx_type     = 'INCOME',
                amount      = instance.total_amount,
                tax_amount  = instance.tax_amount,
                category    = 'SALE',
                description = f"Order {instance.order_number} — {instance.customer_name or 'Walk-in'}",
            )
        )
    except Exception:
        pass

    # Link/create customer visit; always sync name from the order
    try:
        if instance.customer_phone:
            from apps.customers.models import Customer, Visit
            customer, _ = Customer.objects.update_or_create(
                phone=instance.customer_phone,
                defaults={'name': instance.customer_name or 'Unknown'}
            )
            Visit.objects.get_or_create(
                customer=customer,
                order_number=instance.order_number,
                defaults={'amount_spent': instance.total_amount}
            )
    except Exception:
        pass
