from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DepartmentViewSet, ShiftViewSet, EmployeeViewSet, AttendanceViewSet, StaffPaymentViewSet

router = DefaultRouter()
router.register('departments', DepartmentViewSet,   basename='department')
router.register('shifts',      ShiftViewSet,        basename='shift')
router.register('employees',   EmployeeViewSet,     basename='employee')
router.register('attendance',  AttendanceViewSet,   basename='attendance')
router.register('payments',    StaffPaymentViewSet, basename='staff-payment')

urlpatterns = [path('', include(router.urls))]
