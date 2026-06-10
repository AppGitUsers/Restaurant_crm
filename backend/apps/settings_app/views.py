from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import IsAdmin
from .models import RestaurantSettings
from .serializers import RestaurantSettingsSerializer


class SettingsView(APIView):
    """Singleton settings — GET (any auth) or PATCH (admin only)."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get(self, request):
        obj = RestaurantSettings.get_settings()
        return Response(RestaurantSettingsSerializer(obj).data)

    def patch(self, request):
        obj = RestaurantSettings.get_settings()
        serializer = RestaurantSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
