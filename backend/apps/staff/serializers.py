from rest_framework import serializers
from .models import Department, Shift, Employee, Attendance, StaffPayment


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Department
        fields = '__all__'


class ShiftSerializer(serializers.ModelSerializer):
    hours = serializers.FloatField(read_only=True)

    class Meta:
        model  = Shift
        fields = ['id', 'name', 'start_time', 'end_time', 'hours', 'is_active']


class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    shift_name      = serializers.CharField(source='shift.name', read_only=True)
    photo_url       = serializers.SerializerMethodField()

    class Meta:
        model  = Employee
        fields = ['id', 'name', 'phone', 'email', 'department', 'department_name',
                  'shift', 'shift_name', 'employment_type', 'hourly_rate',
                  'address', 'joined_date', 'photo', 'photo_url', 'is_active', 'created_at']

    def get_photo_url(self, obj):
        request = self.context.get('request')
        if obj.photo and request:
            return request.build_absolute_uri(obj.photo.url)
        return None


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.name', read_only=True)

    class Meta:
        model  = Attendance
        fields = ['id', 'employee', 'employee_name', 'date', 'status',
                  'check_in', 'check_out', 'hours_worked', 'notes', 'created_at']
        read_only_fields = ['hours_worked']


class StaffPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.name', read_only=True)

    class Meta:
        model  = StaffPayment
        fields = ['id', 'employee', 'employee_name', 'payment_type', 'amount',
                  'payment_date', 'period_start', 'period_end', 'hours_worked',
                  'notes', 'created_at']
