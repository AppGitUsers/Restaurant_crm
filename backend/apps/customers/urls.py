from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, VisitViewSet

router = DefaultRouter()
router.register('customers', CustomerViewSet, basename='customer')
router.register('visits',    VisitViewSet,    basename='visit')

urlpatterns = [path('', include(router.urls))]
