import os
from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.notifications'
    verbose_name = 'Notifications'

    def ready(self):
        import apps.notifications.signals  # noqa: F401 — connects post_save dispatcher

        # Start scheduler only in the main Django process (not the reloader or management commands)
        if os.environ.get('RUN_MAIN') == 'true' or os.environ.get('DJANGO_SETTINGS_MODULE'):
            import sys
            skip_cmds = {'makemigrations', 'migrate', 'collectstatic', 'shell', 'createsuperuser', 'test'}
            if not any(cmd in sys.argv for cmd in skip_cmds):
                try:
                    from .scheduler import start_scheduler
                    start_scheduler()
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(f'Scheduler failed to start: {e}')
