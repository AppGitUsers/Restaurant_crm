from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    class Role(models.TextChoices):
        ADMIN  = 'ADMIN',  'Admin'
        BILLER = 'BILLER', 'Biller'

    role      = models.CharField(max_length=10, choices=Role.choices, default=Role.BILLER)
    phone     = models.CharField(max_length=15, blank=True)
    is_active = models.BooleanField(default=True)

    def is_admin_user(self):
        return self.role == self.Role.ADMIN

    def is_biller_user(self):
        return self.role == self.Role.BILLER

    def __str__(self):
        return f"{self.username} ({self.role})"
