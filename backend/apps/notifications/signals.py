import logging
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Notification
from .whatsapp import send_whatsapp_message

logger = logging.getLogger(__name__)

_executor = None
_executor_lock = threading.Lock()


def _get_executor():
    global _executor
    if _executor is None:
        with _executor_lock:
            if _executor is None:
                _executor = ThreadPoolExecutor(max_workers=10)
    return _executor


@receiver(post_save, sender=Notification)
def dispatch_whatsapp_on_create(sender, instance, created, **kwargs):
    """
    Fires on every new Notification row with status=PENDING.
    Uses queryset.update() to avoid re-triggering this signal on status change.
    """
    if not created:
        return
    if instance.status != 'PENDING':
        return
    if not instance.recipient_phone:
        logger.warning('Notification %s skipped — no phone', instance.pk)
        Notification.objects.filter(pk=instance.pk).update(
            status='FAILED',
            error_message='No recipient phone number provided.',
        )
        return

    pk      = instance.pk
    phone   = instance.recipient_phone
    message = instance.message

    def _send():
        from django.db import connection
        connection.close()
        time.sleep(0.1)
        try:
            result = send_whatsapp_message(phone=phone, message=message)
            if result['success']:
                Notification.objects.filter(pk=pk).update(
                    status='SENT',
                    sent_at=timezone.now(),
                )
                logger.info('Notification %s sent to %s', pk, phone)
            else:
                Notification.objects.filter(pk=pk).update(
                    status='FAILED',
                    error_message=result.get('error', 'Unknown error'),
                )
                logger.error('Notification %s failed: %s', pk, result.get('error'))
        except Exception as exc:
            logger.exception('Notification %s thread crashed: %s', pk, exc)
            Notification.objects.filter(pk=pk).update(
                status='FAILED',
                error_message=str(exc)[:500],
            )

    _get_executor().submit(_send)
