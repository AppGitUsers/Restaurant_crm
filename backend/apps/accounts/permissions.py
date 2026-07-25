from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    message = 'Admin access required.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == 'ADMIN')


class IsAdminOrManager(BasePermission):
    message = 'Admin or manager access required.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and
                    request.user.role in ['ADMIN', 'MANAGER'])


class IsAdminOrBiller(BasePermission):
    message = 'Authentication required.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and
                    request.user.role in ['ADMIN', 'MANAGER', 'BILLER'])


class IsAdminOrBillerOrKitchen(BasePermission):
    message = 'Authentication required.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and
                    request.user.role in ['ADMIN', 'MANAGER', 'BILLER', 'KITCHEN'])
