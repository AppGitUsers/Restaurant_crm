from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count
from apps.accounts.permissions import IsAdmin
from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset           = Notification.objects.all()
    serializer_class   = NotificationSerializer
    permission_classes = [IsAdmin]
    filterset_fields   = ['notification_type', 'status']
    ordering_fields    = ['created_at']

    @action(detail=False, methods=['get'])
    def stats(self, request):
        data = (
            Notification.objects
            .values('notification_type', 'status')
            .annotate(count=Count('id'))
            .order_by('notification_type', 'status')
        )
        return Response(list(data))
