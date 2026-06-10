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
    print(f'[SCHEDULER] check_auto_absent fired at {datetime.datetime.now().strftime("%H:%M:%S")}')
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
                print(f'[SCHEDULER]   {emp.name} — SKIP (no shift)')
                continue
            if today_code not in emp.shift.days_list:
                print(f'[SCHEDULER]   {emp.name} — SKIP (not a working day today: {today_code}, shift days: {emp.shift.days_list})')
                continue

            shift_start = datetime.datetime.combine(today, emp.shift.start_time)
            threshold   = shift_start + datetime.timedelta(hours=1)

            if now < threshold:
                print(f'[SCHEDULER]   {emp.name} — SKIP (threshold not reached yet: {threshold.strftime("%H:%M")}, now: {now.strftime("%H:%M")})')
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
                print(f'[SCHEDULER]   {emp.name} — SKIP (attendance already exists: {att.status})')
                continue  # Already has an attendance record for today

            print(f'[SCHEDULER]   {emp.name} — MARKED ABSENT')
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
        print('[SCHEDULER] Already running — skipping duplicate start.')
        return

    print('[SCHEDULER] Starting...')
    scheduler.add_job(
        check_auto_absent,
        trigger='cron',
        minute=49,
        id='auto_absent_check',
        replace_existing=True,
        misfire_grace_time=300,
    )

    scheduler.add_job(
        check_low_stock,
        trigger='cron',
        hour='*/3',
        minute=0,
        id='low_stock_check',
        replace_existing=True,
        misfire_grace_time=600,
    )

    scheduler.start()
    print('[SCHEDULER] Started — auto_absent (cron minute=42), low_stock (cron hour=*/3)')
    logger.info('Notification scheduler started — auto_absent (cron), low_stock (cron)')
