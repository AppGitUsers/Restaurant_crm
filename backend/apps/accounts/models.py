from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    class Role(models.TextChoices):
        ADMIN   = 'ADMIN',   'Admin'
        MANAGER = 'MANAGER', 'Manager'
        BILLER  = 'BILLER',  'Biller'
        KITCHEN = 'KITCHEN', 'Kitchen'

    role             = models.CharField(max_length=10, choices=Role.choices, default=Role.BILLER)
    phone            = models.CharField(max_length=15, blank=True)
    is_active        = models.BooleanField(default=True)
    linked_employee  = models.OneToOneField(
        'staff.Employee',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='user_account',
    )
    kitchen = models.ForeignKey(
        'tables.Kitchen',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='users',
    )

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    def is_admin_user(self):
        return self.role == self.Role.ADMIN

    def is_manager_user(self):
        return self.role == self.Role.MANAGER

    def is_biller_user(self):
        return self.role == self.Role.BILLER

    def is_kitchen_user(self):
        return self.role == self.Role.KITCHEN

    def __str__(self):
        return f"{self.username} ({self.role})"
