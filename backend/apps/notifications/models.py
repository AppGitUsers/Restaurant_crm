from django.db import models


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        BILL         = 'BILL',         'Payment Bill'
        ABSENT_STAFF = 'ABSENT_STAFF', 'Absent – Staff'
        ABSENT_ADMIN = 'ABSENT_ADMIN', 'Absent – Admin'
        LOW_STOCK    = 'LOW_STOCK',    'Low Stock Alert'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        SENT    = 'SENT',    'Sent'
        FAILED  = 'FAILED',  'Failed'

    notification_type = models.CharField(max_length=20, choices=NotificationType.choices)
    recipient_phone   = models.CharField(max_length=30)
    message           = models.TextField()
    status            = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reference         = models.CharField(
        max_length=200, blank=True,
        help_text='e.g. order:123 or attendance:456'
    )
    error_message = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    sent_at       = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering     = ['-created_at']
        verbose_name = 'Notification'

    def __str__(self):
        return f"{self.get_notification_type_display()} → {self.recipient_phone} [{self.status}]"
