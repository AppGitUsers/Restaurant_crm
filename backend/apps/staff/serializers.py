import datetime
from rest_framework import serializers
from .models import Department, Shift, Employee, Attendance, StaffPayment


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Department
        fields = '__all__'


class ShiftSerializer(serializers.ModelSerializer):
    hours     = serializers.FloatField(read_only=True)
    days_list = serializers.ListField(read_only=True)

    class Meta:
        model  = Shift
        fields = ['id', 'name', 'start_time', 'end_time',
                  'late_threshold', 'ot_threshold', 'days', 'days_list',
                  'notes', 'hours', 'is_active']


class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    shift_name      = serializers.CharField(source='shift.name', read_only=True)
    photo_url       = serializers.SerializerMethodField()

    class Meta:
        model  = Employee
        fields = ['id', 'name', 'phone', 'email', 'department', 'department_name',
                  'shift', 'shift_name', 'employment_type', 'monthly_salary',
                  'address', 'joined_date', 'photo', 'photo_url', 'is_active', 'created_at']

    def get_photo_url(self, obj):
        request = self.context.get('request')
        if obj.photo and request:
            return request.build_absolute_uri(obj.photo.url)
        return None


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.name', read_only=True)
    is_late       = serializers.SerializerMethodField()
    ot_minutes    = serializers.SerializerMethodField()

    class Meta:
        model  = Attendance
        fields = ['id', 'employee', 'employee_name', 'date', 'status',
                  'check_in', 'check_out', 'hours_worked', 'is_late', 'ot_minutes',
                  'notes', 'created_at']
        read_only_fields = ['hours_worked']

    def get_is_late(self, obj):
        if obj.status != 'PRESENT' or not obj.check_in:
            return False
        shift = obj.employee.shift if hasattr(obj.employee, 'shift') else None
        if not shift:
            return False
        threshold_dt = datetime.datetime.combine(obj.date, shift.start_time) + \
                       datetime.timedelta(minutes=shift.late_threshold)
        check_in_dt  = datetime.datetime.combine(obj.date, obj.check_in)
        return check_in_dt > threshold_dt

    def get_ot_minutes(self, obj):
        if obj.status != 'PRESENT' or not obj.check_out:
            return 0
        shift = obj.employee.shift if hasattr(obj.employee, 'shift') else None
        if not shift:
            return 0
        shift_end_dt = datetime.datetime.combine(obj.date, shift.end_time)
        ot_start_dt  = shift_end_dt + datetime.timedelta(minutes=shift.ot_threshold)
        check_out_dt = datetime.datetime.combine(obj.date, obj.check_out)
        if check_out_dt <= ot_start_dt:
            return 0
        return int((check_out_dt - shift_end_dt).seconds / 60)


class StaffPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.name', read_only=True)

    class Meta:
        model  = StaffPayment
        fields = ['id', 'employee', 'employee_name', 'payment_type', 'amount',
                  'payment_date', 'period_start', 'period_end', 'hours_worked',
                  'notes', 'created_at']
