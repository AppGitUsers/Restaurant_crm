from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FoodTypeViewSet, FoodItemViewSet, IngredientViewSet

router = DefaultRouter()
router.register('types',       FoodTypeViewSet,   basename='food-type')
router.register('items',       FoodItemViewSet,   basename='food-item')
router.register('ingredients', IngredientViewSet, basename='ingredient')

urlpatterns = [path('', include(router.urls))]
