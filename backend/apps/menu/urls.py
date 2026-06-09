from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FoodTypeViewSet, FoodItemViewSet, IngredientViewSet, AddonViewSet

router = DefaultRouter()
router.register('types',       FoodTypeViewSet,   basename='food-type')
router.register('items',       FoodItemViewSet,   basename='food-item')
router.register('ingredients', IngredientViewSet, basename='ingredient')
router.register('addons',      AddonViewSet,      basename='addon')

urlpatterns = [path('', include(router.urls))]
