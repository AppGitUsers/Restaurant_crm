from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from apps.accounts.permissions import IsAdmin, IsAdminOrBiller
from .models import FoodType, FoodItem, Ingredient, RecipeIngredient, Addon, ComboComponent
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
                .prefetch_related(
                    'recipe_ingredients__ingredient__stock',
                    'food_type__addons',
                    'combo_components__component',
                )
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
        for item in FoodItem.objects.filter(is_active=True, is_combo=False):
            item.update_makeable_count()
        for item in FoodItem.objects.filter(is_active=True, is_combo=True):
            item.update_makeable_count()
        return Response({'detail': 'All makeable counts recalculated.'})

    @action(detail=False, methods=['post'], permission_classes=[IsAdmin])
    def create_combo(self, request):
        """Create a pre-defined combo item from customizable category items."""
        name          = (request.data.get('name') or '').strip()
        component_ids = request.data.get('components', [])
        price         = request.data.get('price')

        if not name:
            return Response({'error': 'name is required'}, status=400)
        if not component_ids:
            return Response({'error': 'At least one component is required'}, status=400)

        combo_type, _ = FoodType.objects.get_or_create(
            name='Customized Combos',
            defaults={'icon': '🎨', 'sort_order': 999, 'is_active': True, 'is_customizable': False},
        )

        if not price:
            price = sum(
                float(fi.price)
                for fi in FoodItem.objects.filter(id__in=component_ids)
            )

        food_item = FoodItem.objects.create(
            food_type=combo_type, name=name, price=price,
            is_combo=True, is_available=True, is_active=True, tracks_stock=True,
        )
        for cid in component_ids:
            try:
                ComboComponent.objects.create(combo=food_item, component_id=cid)
            except Exception:
                pass

        food_item.update_makeable_count()
        food_item = (FoodItem.objects
                     .select_related('food_type')
                     .prefetch_related('combo_components__component', 'food_type__addons')
                     .get(pk=food_item.pk))
        return Response(FoodItemSerializer(food_item, context={'request': request}).data, status=201)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def set_combo_components(self, request, pk=None):
        """Replace components for an existing combo item."""
        food_item     = self.get_object()
        component_ids = request.data.get('components', [])
        name          = (request.data.get('name') or '').strip()
        price         = request.data.get('price')

        if name:
            food_item.name = name
        if price is not None:
            food_item.price = price
        food_item.is_combo = True
        food_item.save(update_fields=['name', 'price', 'is_combo'])

        ComboComponent.objects.filter(combo=food_item).delete()
        for cid in component_ids:
            try:
                ComboComponent.objects.create(combo=food_item, component_id=cid)
            except Exception:
                pass

        food_item.update_makeable_count()
        food_item = (FoodItem.objects
                     .select_related('food_type')
                     .prefetch_related('combo_components__component', 'food_type__addons')
                     .get(pk=food_item.pk))
        return Response(FoodItemSerializer(food_item, context={'request': request}).data)
