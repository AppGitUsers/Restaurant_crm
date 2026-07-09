"""
ESSL K30/K90 ADMS push endpoint.

Device configuration (set once on the device web UI):
  Server IP   : <this server's LAN IP>
  Port        : <Django port, e.g. 8000>
  HTTPS       : No
  Server Path : /iclock

Punch logic (irrespective of what the device sends as status):
  1st punch of the day  → check-in  (create Attendance row)
  2nd punch of the day  → check-out (update same row, model auto-calculates hours_worked)
  3rd+ punches          → ignored silently

Employee mapping: enroll each employee on the device using their Django Employee pk as the PIN.
"""

import logging
import datetime

from django.http import HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from .models import Employee, Attendance

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class EsslPushView(View):

    def get(self, request):
        """Device handshake — sent on power-up and reconnect."""
        sn = request.GET.get('SN', '')
        logger.info("ESSL handshake: SN=%s", sn)
        content = (
            f"GET OPTION FROM: {sn}\n"
            "ServerVer=2.2.14\n"
            "PushProtVer=2.1\n"
            "Encrypt=None\n"
            "Realtime=1\n"
        )
        return HttpResponse(content, content_type='text/plain')

    def post(self, request):
        """Receive attendance punch records from device."""
        sn    = request.GET.get('SN', '')
        table = request.GET.get('table', '')

        # Only care about attendance logs
        if table != 'ATTLOG':
            return HttpResponse('OK', content_type='text/plain')

        body  = request.body.decode('utf-8', errors='ignore').strip()
        lines = [ln for ln in body.splitlines() if ln.strip()]

        for line in lines:
            # Each line: PIN\tTime\tStatus\tVerify\tWorkCode\tReserved
            parts = line.split('\t')
            if len(parts) < 2:
                continue

            pin_str  = parts[0].strip()
            time_str = parts[1].strip()

            # Validate PIN is an integer (Django pk)
            try:
                emp_pk = int(pin_str)
            except ValueError:
                logger.warning("ESSL: non-integer PIN '%s' from SN=%s — skipped", pin_str, sn)
                continue

            # Resolve employee
            try:
                employee = Employee.objects.get(pk=emp_pk, is_active=True)
            except Employee.DoesNotExist:
                logger.warning("ESSL: no active employee pk=%d from SN=%s — skipped", emp_pk, sn)
                continue

            # Parse device datetime; fall back to server time if malformed
            try:
                punch_dt   = datetime.datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S')
                punch_date = punch_dt.date()
                punch_time = punch_dt.time()
            except ValueError:
                now        = timezone.localtime()
                punch_date = now.date()
                punch_time = now.time().replace(microsecond=0)
                logger.warning("ESSL: bad datetime '%s' for pk=%d — using server time", time_str, emp_pk)

            # Apply first/second punch logic
            try:
                att = Attendance.objects.get(employee=employee, date=punch_date)

                if att.check_out is not None:
                    # 3rd or more punch — ignore
                    logger.debug("ESSL: 3rd+ punch ignored employee=%s date=%s", employee.name, punch_date)
                else:
                    # 2nd punch — check-out; model.save() auto-calculates hours_worked
                    att.check_out = punch_time
                    att.save(update_fields=['check_out', 'hours_worked'])
                    logger.info("ESSL check-out: employee=%s date=%s time=%s hours=%s",
                                employee.name, punch_date, punch_time, att.hours_worked)

            except Attendance.DoesNotExist:
                # 1st punch — check-in
                Attendance.objects.create(
                    employee=employee,
                    date=punch_date,
                    status=Attendance.Status.PRESENT,
                    check_in=punch_time,
                )
                logger.info("ESSL check-in: employee=%s date=%s time=%s", employee.name, punch_date, punch_time)

        return HttpResponse('OK', content_type='text/plain')
