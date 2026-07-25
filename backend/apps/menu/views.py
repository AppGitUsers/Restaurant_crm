import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from apps.accounts.permissions import IsAdmin, IsAdminOrManager, IsAdminOrBiller
from .models import FoodType, FoodItem, Ingredient, RecipeIngredient, Addon, ComboComponent
from .serializers import (FoodTypeSerializer, FoodItemSerializer,
                           FoodItemWriteSerializer, IngredientSerializer,
                           RecipeIngredientSerializer, AddonSerializer)

logger = logging.getLogger(__name__)


class AddonViewSet(viewsets.ModelViewSet):
    queryset           = Addon.objects.all()
    serializer_class   = AddonSerializer
    filterset_fields   = ['is_active']
    search_fields      = ['name']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAdminOrBiller()]
        return [IsAdminOrManager()]

    def perform_create(self, serializer):
        addon = serializer.save()
        logger.info("Addon created: admin=%s name=%s price=%s", self.request.user, addon.name, addon.price)

    def perform_update(self, serializer):
        serializer.save()
        logger.info("Addon updated: admin=%s name=%s fields=%s",
                    self.request.user, serializer.instance.name, list(self.request.data.keys()))

    def perform_destroy(self, instance):
        logger.info("Addon deleted: admin=%s name=%s", self.request.user, instance.name)
        instance.delete()


class FoodTypeViewSet(viewsets.ModelViewSet):
    queryset           = FoodType.objects.prefetch_related('addons').all()
    serializer_class   = FoodTypeSerializer
    filterset_fields   = ['is_active', 'is_customizable']
    search_fields      = ['name']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAdminOrBiller()]
        return [IsAdminOrManager()]

    def perform_create(self, serializer):
        ft = serializer.save()
        logger.info("FoodType created: admin=%s name=%s", self.request.user, ft.name)

    def perform_update(self, serializer):
        serializer.save()
        logger.info("FoodType updated: admin=%s name=%s fields=%s",
                    self.request.user, serializer.instance.name, list(self.request.data.keys()))

    def perform_destroy(self, instance):
        logger.info("FoodType deleted: admin=%s name=%s", self.request.user, instance.name)
        instance.delete()


class IngredientViewSet(viewsets.ModelViewSet):
    queryset           = Ingredient.objects.select_related('stock').all()
    serializer_class   = IngredientSerializer
    permission_classes = [IsAdminOrManager]
    filterset_fields   = ['is_active', 'unit']
    search_fields      = ['name']

    def perform_create(self, serializer):
        ingredient = serializer.save()
        logger.info("Ingredient created: admin=%s name=%s unit=%s",
                    self.request.user, ingredient.name, ingredient.unit)

    def perform_update(self, serializer):
        serializer.save()
        logger.info("Ingredient updated: admin=%s name=%s fields=%s",
                    self.request.user, serializer.instance.name, list(self.request.data.keys()))

    def perform_destroy(self, instance):
        logger.info("Ingredient deleted: admin=%s name=%s", self.request.user, instance.name)
        instance.delete()


class FoodItemViewSet(viewsets.ModelViewSet):
    queryset = (FoodItem.objects
                .select_related('food_type')
                .prefetch_related(
                    'recipe_ingredients__ingredient__stock',
                    'food_type__addons',
                    'combo_components__component',
                )
                .all())
    parser_classes   = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None
    filterset_fields = ['food_type', 'is_available', 'is_active']
    search_fields    = ['name', 'description']
    ordering_fields  = ['name', 'price', 'makeable_count', 'created_at']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAdminOrBiller()]
        return [IsAdminOrManager()]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return FoodItemWriteSerializer
        return FoodItemSerializer

    def perform_create(self, serializer):
        item = serializer.save()
        logger.info("FoodItem created: admin=%s name=%s price=%s type=%s",
                    self.request.user, item.name, item.price, item.food_type.name)

    def perform_update(self, serializer):
        was_tracking = serializer.instance.tracks_stock
        instance = serializer.save()
        # Switching from no-tracking to tracking: cached makeable_count is still
        # 999 (the unlimited sentinel). Recalculate immediately from real stock.
        if not was_tracking and instance.tracks_stock:
            instance.update_makeable_count()
            logger.info("FoodItem stock tracking enabled: admin=%s item=%s — recalculating makeable count",
                        self.request.user, instance.name)
        else:
            logger.info("FoodItem updated: admin=%s item=%s fields=%s",
                        self.request.user, instance.name, list(self.request.data.keys()))

    def perform_destroy(self, instance):
        logger.info("FoodItem deleted: admin=%s item=%s", self.request.user, instance.name)
        instance.delete()

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrManager])
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
        logger.info("Recipe set: admin=%s item=%s ingredients=%d errors=%d",
                    request.user, food_item.name, len(ingredients), len(errors))
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

    @action(detail=False, methods=['post'], permission_classes=[IsAdminOrManager])
    def recalculate_all(self, request):
        count = 0
        for item in FoodItem.objects.filter(is_active=True, is_combo=False):
            item.update_makeable_count()
            count += 1
        for item in FoodItem.objects.filter(is_active=True, is_combo=True):
            item.update_makeable_count()
            count += 1
        logger.info("Makeable counts recalculated: admin=%s items=%d", request.user, count)
        return Response({'detail': 'All makeable counts recalculated.'})

    @action(detail=False, methods=['post'], permission_classes=[IsAdminOrManager])
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
        logger.info("Combo created: admin=%s name=%s components=%d price=%s",
                    request.user, name, len(component_ids), price)
        return Response(FoodItemSerializer(food_item, context={'request': request}).data, status=201)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrManager])
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
        logger.info("Combo components updated: admin=%s item=%s components=%d",
                    request.user, food_item.name, len(component_ids))
        return Response(FoodItemSerializer(food_item, context={'request': request}).data)
