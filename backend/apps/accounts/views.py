import logging
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import CustomUser
from .serializers import CustomTokenObtainPairSerializer, UserSerializer, UserListSerializer
from .permissions import IsAdmin

logger = logging.getLogger(__name__)


class LoginThrottle(AnonRateThrottle):
    scope = 'login'   # 5/min — stops brute-force and credential stuffing


class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class   = CustomTokenObtainPairSerializer
    throttle_classes   = [LoginThrottle]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        username = request.data.get('username', '')
        if response.status_code == 200:
            logger.info("Login successful: user=%s ip=%s", username, request.META.get('REMOTE_ADDR', ''))
        else:
            logger.warning("Login failed: user=%s ip=%s status=%d", username, request.META.get('REMOTE_ADDR', ''), response.status_code)
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data['refresh'])
            token.blacklist()
            logger.info("Logout: user=%s", request.user)
            return Response({'detail': 'Logged out successfully.'})
        except Exception:
            logger.warning("Logout failed (invalid token): user=%s", request.user)
            return Response({'detail': 'Invalid token.'}, status=400)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserListSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info("Profile updated: user=%s fields=%s", request.user, list(request.data.keys()))
        return Response(UserListSerializer(request.user).data)


class UserListCreateView(generics.ListCreateAPIView):
    queryset           = CustomUser.objects.all().order_by('-date_joined')
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return UserListSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        logger.info("User created: admin=%s new_user=%s role=%s",
                    self.request.user, user.username, getattr(user, 'role', '—'))


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset           = CustomUser.objects.all()
    serializer_class   = UserSerializer
    permission_classes = [IsAdmin]

    def perform_update(self, serializer):
        serializer.save()
        logger.info("User updated: admin=%s target=%s fields=%s",
                    self.request.user, serializer.instance.username, list(self.request.data.keys()))

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user == request.user:
            logger.warning("Self-delete blocked: user=%s", request.user)
            return Response({'detail': 'Cannot delete your own account.'}, status=400)
        user.is_active = False
        user.save()
        logger.info("User deactivated: admin=%s target=%s", request.user, user.username)
        return Response({'detail': 'User deactivated.'})
