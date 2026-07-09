import logging
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.accounts.permissions import IsAdmin, IsAdminOrBiller
from .models import Customer, Visit
from .serializers import CustomerSerializer, VisitSerializer

logger = logging.getLogger(__name__)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset           = Customer.objects.prefetch_related('visits').all()
    serializer_class   = CustomerSerializer
    permission_classes = [IsAdminOrBiller]
    filterset_fields   = ['frequency_tag', 'phone']
    search_fields      = ['name', 'phone', 'email']
    ordering_fields    = ['total_visits', 'total_spent', 'created_at']

    def perform_create(self, serializer):
        customer = serializer.save()
        logger.info("Customer created: user=%s name=%s phone=%s",
                    self.request.user, customer.name, customer.phone)

    def perform_update(self, serializer):
        serializer.save()
        logger.info("Customer updated: user=%s customer=%s fields=%s",
                    self.request.user, serializer.instance.name, list(self.request.data.keys()))

    def perform_destroy(self, instance):
        logger.info("Customer deleted: user=%s name=%s phone=%s",
                    self.request.user, instance.name, instance.phone)
        instance.delete()

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
