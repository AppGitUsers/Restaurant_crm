from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from apps.accounts.permissions import IsAdmin, IsAdminOrBiller
from .models import FoodType, FoodItem, Ingredient, RecipeIngredient, Addon
from .serializers import (FoodTypeSerializer, FoodItemSerializer,
                           FoodItemWriteSerializer, IngredientSerializer,
                           RecipeIngredientSerializer, AddonSerializer)


class AddonViewSet(viewsets.ModelViewSet):
    queryset           = Addon.objects.all()
    serializer_class   = AddonSerializer
    filterset_fields   = ['is_active']
    search_fields      = ['name']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAdminOrBiller()]
        return [IsAdmin()]


class FoodTypeViewSet(viewsets.ModelViewSet):
    queryset           = FoodType.objects.prefetch_related('addons').all()
    serializer_class   = FoodTypeSerializer
    filterset_fields   = ['is_active', 'is_customizable']
    search_fields      = ['name']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAdminOrBiller()]
        return [IsAdmin()]


class IngredientViewSet(viewsets.ModelViewSet):
    queryset           = Ingredient.objects.select_related('stock').all()
    serializer_class   = IngredientSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['is_active', 'unit']
    search_fields      = ['name']


class FoodItemViewSet(viewsets.ModelViewSet):
    queryset = (FoodItem.objects
                .select_related('food_type')
                .prefetch_related('recipe_ingredients__ingredient__stock', 'food_type__addons')
                .all())
    parser_classes  = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['food_type', 'is_available', 'is_active']
    search_fields    = ['name', 'description']
    ordering_fields  = ['name', 'price', 'makeable_count', 'created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAdminOrBiller()]
        return [IsAdmin()]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return FoodItemWriteSerializer
        return FoodItemSerializer

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def set_recipe(self, request, pk=None):
        """Set/replace full recipe for a food item. Body: {ingredients:[{ingredient,quantity_required}]}"""
        food_item   = self.get_object()
        ingredients = request.data.get('ingredients', [])

        RecipeIngredient.objects.filter(food_item=food_item).delete()
        errors = []
        for item in ingredients:
            try:
                RecipeIngredient.objects.create(
                    food_item         = food_item,
                    ingredient_id     = item['ingredient'],
                    quantity_required = item['quantity_required'],
                )
            except Exception as e:
                errors.append(str(e))

        food_item.update_makeable_count()
        serializer = FoodItemSerializer(food_item, context={'request': request})
        resp = serializer.data
        if errors:
            resp['warnings'] = errors
        return Response(resp)

    @action(detail=True, methods=['get'], permission_classes=[IsAdminOrBiller])
    def recipe(self, request, pk=None):
        food_item = self.get_object()
        ris = food_item.recipe_ingredients.select_related('ingredient__stock').all()
        return Response(RecipeIngredientSerializer(ris, many=True).data)

    @action(detail=False, methods=['post'], permission_classes=[IsAdmin])
    def recalculate_all(self, request):
        for item in FoodItem.objects.filter(is_active=True):
            item.update_makeable_count()
        return Response({'detail': 'All makeable counts recalculated.'})
