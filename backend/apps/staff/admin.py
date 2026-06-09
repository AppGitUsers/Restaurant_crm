from django.contrib import admin
from .models import Department, Shift, Employee, Attendance, StaffPayment

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active']

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ['name', 'start_time', 'end_time', 'is_active']

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display  = ['name', 'department', 'shift', 'employment_type', 'monthly_salary', 'is_active']
    list_filter   = ['department', 'employment_type', 'is_active']
    search_fields = ['name', 'phone', 'email']

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display  = ['employee', 'date', 'status', 'hours_worked']
    list_filter   = ['status', 'date']
    search_fields = ['employee__name']

@admin.register(StaffPayment)
class StaffPaymentAdmin(admin.ModelAdmin):
    list_display  = ['employee', 'payment_type', 'amount', 'payment_date']
    list_filter   = ['payment_type']
    search_fields = ['employee__name']
