from django.contrib import admin
from .models import FoodType, FoodItem, Ingredient, RecipeIngredient


@admin.register(FoodType)
class FoodTypeAdmin(admin.ModelAdmin):
    list_display  = ['name', 'icon', 'sort_order', 'is_active']
    list_editable = ['sort_order', 'is_active']
    search_fields = ['name']


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    list_display  = ['name', 'unit', 'is_active']
    list_filter   = ['unit', 'is_active']
    search_fields = ['name']


class RecipeIngredientInline(admin.TabularInline):
    model = RecipeIngredient
    extra = 1
    autocomplete_fields = ['ingredient']


@admin.register(FoodItem)
class FoodItemAdmin(admin.ModelAdmin):
    list_display   = ['name', 'food_type', 'price', 'is_available', 'makeable_count', 'is_active']
    list_filter    = ['food_type', 'is_available', 'is_active']
    search_fields  = ['name', 'description']
    readonly_fields = ['makeable_count']
    inlines        = [RecipeIngredientInline]
