from rest_framework import serializers
from .models import FoodType, FoodItem, Ingredient, RecipeIngredient


class FoodTypeSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model  = FoodType
        fields = ['id', 'name', 'description', 'icon', 'sort_order', 'is_active',
                  'item_count', 'created_at']

    def get_item_count(self, obj):
        return obj.items.filter(is_active=True).count()


class IngredientSerializer(serializers.ModelSerializer):
    current_stock = serializers.SerializerMethodField()

    class Meta:
        model  = Ingredient
        fields = ['id', 'name', 'unit', 'description', 'is_active', 'current_stock', 'created_at']

    def get_current_stock(self, obj):
        try:
            return float(obj.stock.current_quantity)
        except Exception:
            return 0.0


class RecipeIngredientSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source='ingredient.name', read_only=True)
    unit            = serializers.CharField(source='ingredient.unit', read_only=True)
    current_stock   = serializers.SerializerMethodField()

    class Meta:
        model  = RecipeIngredient
        fields = ['id', 'ingredient', 'ingredient_name', 'unit',
                  'quantity_required', 'current_stock']

    def get_current_stock(self, obj):
        try:
            return float(obj.ingredient.stock.current_quantity)
        except Exception:
            return 0.0


class FoodItemSerializer(serializers.ModelSerializer):
    food_type_name     = serializers.CharField(source='food_type.name', read_only=True)
    food_type_icon     = serializers.CharField(source='food_type.icon', read_only=True)
    recipe_ingredients = RecipeIngredientSerializer(many=True, read_only=True)
    photo_url          = serializers.SerializerMethodField()

    class Meta:
        model  = FoodItem
        fields = ['id', 'food_type', 'food_type_name', 'food_type_icon',
                  'name', 'description', 'price', 'photo', 'photo_url',
                  'is_available', 'is_active', 'makeable_count',
                  'recipe_ingredients', 'created_at', 'updated_at']

    def get_photo_url(self, obj):
        request = self.context.get('request')
        if obj.photo and request:
            return request.build_absolute_uri(obj.photo.url)
        return None


class FoodItemWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FoodItem
        fields = ['id', 'food_type', 'name', 'description', 'price',
                  'photo', 'is_available', 'is_active']
