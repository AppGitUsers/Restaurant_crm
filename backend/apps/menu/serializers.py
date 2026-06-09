from rest_framework import serializers
from .models import FoodType, FoodItem, Ingredient, RecipeIngredient, Addon


class AddonSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Addon
        fields = ['id', 'name', 'is_costed', 'price', 'is_active', 'created_at']


class FoodTypeSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()
    addons     = AddonSerializer(many=True, read_only=True)
    addon_ids  = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    class Meta:
        model  = FoodType
        fields = ['id', 'name', 'description', 'icon', 'sort_order', 'is_active',
                  'allow_addons', 'addons', 'addon_ids', 'item_count', 'created_at']

    def get_item_count(self, obj):
        return obj.items.filter(is_active=True).count()

    def _set_addons(self, instance, addon_ids):
        instance.addons.set(Addon.objects.filter(id__in=addon_ids))

    def create(self, validated_data):
        addon_ids = validated_data.pop('addon_ids', None)
        instance  = super().create(validated_data)
        if addon_ids is not None:
            self._set_addons(instance, addon_ids)
        return instance

    def update(self, instance, validated_data):
        addon_ids = validated_data.pop('addon_ids', None)
        instance  = super().update(instance, validated_data)
        if addon_ids is not None:
            self._set_addons(instance, addon_ids)
        return instance


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
    food_type_name         = serializers.CharField(source='food_type.name', read_only=True)
    food_type_icon         = serializers.CharField(source='food_type.icon', read_only=True)
    food_type_allow_addons = serializers.BooleanField(source='food_type.allow_addons', read_only=True)
    food_type_addons       = AddonSerializer(source='food_type.addons', many=True, read_only=True)
    recipe_ingredients     = RecipeIngredientSerializer(many=True, read_only=True)
    photo_url              = serializers.SerializerMethodField()

    class Meta:
        model  = FoodItem
        fields = ['id', 'food_type', 'food_type_name', 'food_type_icon',
                  'food_type_allow_addons', 'food_type_addons',
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
