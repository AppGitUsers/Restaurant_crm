from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.accounts.permissions import IsAdmin, IsAdminOrBiller
from .models import Customer, Visit
from .serializers import CustomerSerializer, VisitSerializer

class CustomerViewSet(viewsets.ModelViewSet):
    queryset           = Customer.objects.prefetch_related('visits').all()
    serializer_class   = CustomerSerializer
    permission_classes = [IsAdminOrBiller]
    filterset_fields   = ['frequency_tag']
    search_fields      = ['name', 'phone', 'email']
    ordering_fields    = ['total_visits', 'total_spent', 'created_at']

    @action(detail=False, methods=['get'])
    def high_value(self, request):
        qs = self.get_queryset().filter(frequency_tag='HIGH')
        return Response(CustomerSerializer(qs, many=True).data)

class VisitViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = Visit.objects.select_related('customer').all()
    serializer_class   = VisitSerializer
    permission_classes = [IsAdminOrBiller]
    filterset_fields   = ['customer']
    ordering_fields    = ['visited_at', 'amount_spent']
