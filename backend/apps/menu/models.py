from django.db import models


class Addon(models.Model):
    name       = models.CharField(max_length=200, unique=True)
    is_costed  = models.BooleanField(default=False)
    price      = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class FoodType(models.Model):
    name         = models.CharField(max_length=100, unique=True)
    description  = models.TextField(blank=True)
    icon         = models.CharField(max_length=50, blank=True, help_text='Emoji or icon class')
    sort_order   = models.PositiveIntegerField(default=0)
    is_active    = models.BooleanField(default=True)
    allow_addons    = models.BooleanField(default=False)
    addons          = models.ManyToManyField('Addon', blank=True, related_name='food_types')
    is_customizable = models.BooleanField(default=False)
    kitchen         = models.ForeignKey('tables.Kitchen', on_delete=models.SET_NULL, null=True, blank=True, related_name='food_types')
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class Ingredient(models.Model):
    class Unit(models.TextChoices):
        GRAM       = 'g',    'Gram'
        KILOGRAM   = 'kg',   'Kilogram'
        MILLILITER = 'ml',   'Milliliter'
        LITER      = 'l',    'Liter'
        PIECE      = 'pcs',  'Piece'
        TABLESPOON = 'tbsp', 'Tablespoon'
        TEASPOON   = 'tsp',  'Teaspoon'

    name        = models.CharField(max_length=200, unique=True)
    unit        = models.CharField(max_length=10, choices=Unit.choices, default=Unit.GRAM)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.unit})"


class FoodItem(models.Model):
    food_type      = models.ForeignKey(FoodType, on_delete=models.PROTECT, related_name='items')
    name           = models.CharField(max_length=200)
    description    = models.TextField(blank=True)
    price          = models.DecimalField(max_digits=10, decimal_places=2)
    photo          = models.ImageField(upload_to='menu/photos/', blank=True, null=True)
    is_available   = models.BooleanField(default=True)
    is_active      = models.BooleanField(default=True)
    tracks_stock   = models.BooleanField(default=True)
    is_combo       = models.BooleanField(default=False)
    makeable_count = models.IntegerField(default=0)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['food_type__sort_order', 'food_type__name', 'name']

    def __str__(self):
        return f"{self.name} — {self.food_type.name}"

    def update_makeable_count(self):
        """Recalculate how many of this item can be made from current inventory."""
        from apps.inventory.models import Stock

        if not self.tracks_stock:
            self.makeable_count = 999
            self.save(update_fields=['makeable_count'])
            return

        if self.is_combo:
            comp_ids = list(self.combo_components.values_list('component_id', flat=True))
            if not comp_ids:
                self.makeable_count = 0
                self.save(update_fields=['makeable_count'])
                return
            counts = list(FoodItem.objects.filter(id__in=comp_ids).values_list('makeable_count', flat=True))
            self.makeable_count = min(counts) if counts else 0
            self.save(update_fields=['makeable_count'])
            return

        recipe_items = self.recipe_ingredients.select_related('ingredient').all()

        if not recipe_items.exists():
            self.makeable_count = 0
            self.save(update_fields=['makeable_count'])
            return

        min_count = None
        for ri in recipe_items:
            try:
                stock = Stock.objects.get(ingredient=ri.ingredient)
                qty = ri.quantity_required
                if qty and qty > 0:
                    possible = int(stock.current_quantity // qty)
                else:
                    possible = 999
            except Stock.DoesNotExist:
                possible = 0

            if min_count is None or possible < min_count:
                min_count = possible

        self.makeable_count = min_count if min_count is not None else 0
        self.save(update_fields=['makeable_count'])


class RecipeIngredient(models.Model):
    food_item         = models.ForeignKey(FoodItem, on_delete=models.CASCADE, related_name='recipe_ingredients')
    ingredient        = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='used_in_recipes')
    quantity_required = models.DecimalField(max_digits=10, decimal_places=3)

    class Meta:
        unique_together = ['food_item', 'ingredient']

    def __str__(self):
        return f"{self.food_item.name} ← {self.ingredient.name} × {self.quantity_required}{self.ingredient.unit}"


class ComboComponent(models.Model):
    combo     = models.ForeignKey(FoodItem, on_delete=models.CASCADE, related_name='combo_components')
    component = models.ForeignKey(FoodItem, on_delete=models.CASCADE, related_name='used_in_combos')

    class Meta:
        unique_together = ['combo', 'component']
        ordering        = ['id']

    def __str__(self):
        return f"{self.combo.name} ← {self.component.name}"
