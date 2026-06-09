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
        ).order_by('date')
        return Response(AttendanceSerializer(records, many=True).data)

    @action(detail=True, methods=['get'])
    def payment_history(self, request, pk=None):
        employee = self.get_object()
        payments = StaffPayment.objects.filter(employee=employee).order_by('-payment_date')
        return Response(StaffPaymentSerializer(payments, many=True).data)


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.select_related('employee').all()
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


class StaffPaymentViewSet(viewsets.ModelViewSet):
    queryset           = StaffPayment.objects.select_related('employee').all()
    serializer_class   = StaffPaymentSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['employee', 'payment_type', 'payment_date']
    search_fields      = ['employee__name']
    ordering_fields    = ['payment_date', 'amount']
