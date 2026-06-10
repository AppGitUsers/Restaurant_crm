import logging
import datetime

from apscheduler.schedulers.background import BackgroundScheduler

logger    = logging.getLogger(__name__)
scheduler = BackgroundScheduler(timezone='Asia/Kolkata')


def check_auto_absent():
    """
    Marks staff ABSENT if no punch-in is recorded within 1 hour of their
    shift start time on a scheduled working day.
    """
    try:
        from apps.staff.models import Employee, Attendance
        from . import utils

        today      = datetime.date.today()
        now        = datetime.datetime.now()
        day_map    = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
        today_code = day_map[today.weekday()]

        employees = Employee.objects.select_related('shift', 'department').all()

        for emp in employees:
            if not emp.shift:
                continue
            if today_code not in emp.shift.days_list:
                continue

            shift_start = datetime.datetime.combine(today, emp.shift.start_time)
            threshold   = shift_start + datetime.timedelta(hours=1)

            if now < threshold:
                continue  # Not yet past the 1-hour grace window

            att, created = Attendance.objects.get_or_create(
                employee=emp,
                date=today,
                defaults={
                    'status': 'ABSENT',
                    'notes': f'Auto-marked absent: no check-in by {threshold.strftime("%H:%M")}',
                },
            )

            if not created:
                continue  # Already has an attendance record for today

            logger.info('Auto-absent: %s [%s]', emp.name, today)

            threshold_str = threshold.strftime('%I:%M %p')
            utils.send_absent_staff_notification(emp, att, threshold_str)
            utils.send_absent_admin_notification(emp, att, threshold_str)

    except Exception as exc:
        logger.error('check_auto_absent error: %s', exc, exc_info=True)


def check_low_stock():
    """
    Sends a consolidated low-stock alert to the admin if any ingredient
    is at or below its minimum threshold.
    """
    try:
        from apps.inventory.models import Stock
        from . import utils

        low_items = [
            s for s in Stock.objects.select_related('ingredient').all()
            if s.is_low and float(s.minimum_threshold) > 0
        ]
        if not low_items:
            return

        utils.send_low_stock_notification(low_items)

    except Exception as exc:
        logger.error('check_low_stock error: %s', exc, exc_info=True)


def start_scheduler():
    if scheduler.running:
        return

    scheduler.add_job(
        check_auto_absent,
        trigger='interval',
        hours=1,
        id='auto_absent_check',
        replace_existing=True,
        misfire_grace_time=300,
    )

    scheduler.add_job(
        check_low_stock,
        trigger='interval',
        hours=6,
        id='low_stock_check',
        replace_existing=True,
        misfire_grace_time=600,
    )

    scheduler.start()
    logger.info('Notification scheduler started — auto_absent (1h), low_stock (6h)')
