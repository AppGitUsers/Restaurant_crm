from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from apps.accounts.permissions import IsAdmin
from .models import Department, Shift, Employee, Attendance, StaffPayment
from .serializers import (DepartmentSerializer, ShiftSerializer, EmployeeSerializer,
                           AttendanceSerializer, StaffPaymentSerializer)


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset           = Department.objects.all()
    serializer_class   = DepartmentSerializer
    permission_classes = [IsAdmin]


class ShiftViewSet(viewsets.ModelViewSet):
    queryset           = Shift.objects.all()
    serializer_class   = ShiftSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['is_active']


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('department', 'shift').all()
    serializer_class   = EmployeeSerializer
    parser_classes     = [MultiPartParser, FormParser, JSONParser]
    filterset_fields   = ['department', 'shift', 'employment_type', 'is_active']
    search_fields      = ['name', 'phone', 'email']

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            from apps.accounts.permissions import IsAdminOrBiller
            return [IsAdminOrBiller()]
        return [IsAdmin()]

    @action(detail=True, methods=['get'])
    def attendance_calendar(self, request, pk=None):
        employee = self.get_object()
        year  = int(request.query_params.get('year',  __import__('datetime').date.today().year))
        month = int(request.query_params.get('month', __import__('datetime').date.today().month))
        records = Attendance.objects.filter(
            employee=employee, date__year=year, date__month=month
        ).select_related('employee__shift').order_by('date')
        return Response(AttendanceSerializer(records, many=True).data)

    @action(detail=True, methods=['get'])
    def payment_history(self, request, pk=None):
        employee = self.get_object()
        payments = StaffPayment.objects.filter(employee=employee).order_by('-payment_date')
        return Response(StaffPaymentSerializer(payments, many=True).data)


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.select_related('employee__shift').all()
    serializer_class   = AttendanceSerializer
    filterset_fields   = ['employee', 'date', 'status']
    search_fields      = ['employee__name']
    ordering_fields    = ['date']

    def get_permissions(self):
        from apps.accounts.permissions import IsAdminOrBiller
        if self.action in ('list', 'retrieve', 'create', 'partial_update', 'update'):
            return [IsAdminOrBiller()]
        return [IsAdmin()]

    @action(detail=False, methods=['get'])
    def by_date(self, request):
        date = request.query_params.get('date')
        if not date:
            import datetime
            date = str(datetime.date.today())
        records = self.get_queryset().filter(date=date)
        return Response(AttendanceSerializer(records, many=True).data)

    @action(detail=False, methods=['get'])
    def monthly_summary(self, request):
        import datetime
        import calendar as cal_module

        year  = int(request.query_params.get('year',  datetime.date.today().year))
        month = int(request.query_params.get('month', datetime.date.today().month))

        employees = Employee.objects.select_related('shift', 'department').order_by('name')

        attendance_records = Attendance.objects.filter(
            date__year=year,
            date__month=month,
        )

        att_map = {}
        for att in attendance_records:
            att_map.setdefault(att.employee_id, []).append(att)

        def working_days_and_hours(shift, year, month):
            if not shift:
                return 0, 0.0
            num_days  = cal_module.monthrange(year, month)[1]
            day_names = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
            codes     = {d.strip() for d in shift.days.split(',') if d.strip()}
            count = sum(
                1 for d in range(1, num_days + 1)
                if day_names[datetime.date(year, month, d).weekday()] in codes
            )
            return count, round(count * float(shift.hours), 2)

        results = []
        for emp in employees:
            working_days, required_hours = working_days_and_hours(emp.shift, year, month)
            att_list = att_map.get(emp.id, [])
            shift_daily = float(emp.shift.hours) if emp.shift else 0.0

            hours_worked = 0.0
            for a in att_list:
                if a.status in ('PRESENT', 'HALF'):
                    if float(a.hours_worked or 0) > 0:
                        hours_worked += float(a.hours_worked)
                    elif a.status == 'PRESENT':
                        hours_worked += shift_daily
                    else:
                        hours_worked += shift_daily / 2
            hours_worked = round(hours_worked, 2)

            present_days = sum(1 for a in att_list if a.status == 'PRESENT')
            half_days    = sum(1 for a in att_list if a.status == 'HALF')
            absent_days  = sum(1 for a in att_list if a.status == 'ABSENT')

            attendance_pct = (
                min(100.0, round(hours_worked / required_hours * 100, 2))
                if required_hours > 0 else 0.0
            )

            full_salary       = float(emp.monthly_salary)
            calculated_salary = round(full_salary * attendance_pct / 100, 2)

            paid_this_month = StaffPayment.objects.filter(
                employee=emp,
                payment_type='SALARY',
                payment_date__year=year,
                payment_date__month=month,
            ).exists()

            results.append({
                'employee_id':       emp.id,
                'employee_name':     emp.name,
                'department':        emp.department.name if emp.department else '—',
                'shift_name':        emp.shift.name if emp.shift else '—',
                'shift_hours':       shift_daily,
                'working_days':      working_days,
                'required_hours':    required_hours,
                'hours_worked':      hours_worked,
                'present_days':      present_days,
                'half_days':         half_days,
                'absent_days':       absent_days,
                'attendance_pct':    attendance_pct,
                'full_salary':       full_salary,
                'calculated_salary': calculated_salary,
                'paid_this_month':   paid_this_month,
            })

        return Response(results)


class StaffPaymentViewSet(viewsets.ModelViewSet):
    queryset           = StaffPayment.objects.select_related('employee').all()
    serializer_class   = StaffPaymentSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['employee', 'payment_type', 'payment_date']
    search_fields      = ['employee__name']
    ordering_fields    = ['payment_date', 'amount']
