from django.db import models


class Department(models.Model):
    name       = models.CharField(max_length=100, unique=True)
    is_active  = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Shift(models.Model):
    name       = models.CharField(max_length=100)
    start_time = models.TimeField()
    end_time   = models.TimeField()
    is_active  = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.start_time.strftime('%H:%M')} – {self.end_time.strftime('%H:%M')})"

    @property
    def hours(self):
        import datetime
        start = datetime.datetime.combine(datetime.date.today(), self.start_time)
        end   = datetime.datetime.combine(datetime.date.today(), self.end_time)
        if end < start:
            end += datetime.timedelta(days=1)
        return round((end - start).seconds / 3600, 2)


class Employee(models.Model):
    class EmploymentType(models.TextChoices):
        FULL_TIME = 'FULL_TIME', 'Full Time'
        PART_TIME = 'PART_TIME', 'Part Time'
        CONTRACT  = 'CONTRACT',  'Contract'

    name            = models.CharField(max_length=200)
    phone           = models.CharField(max_length=15)
    email           = models.EmailField(blank=True)
    department      = models.ForeignKey(Department, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='employees')
    shift           = models.ForeignKey(Shift, on_delete=models.SET_NULL,
                                         null=True, blank=True, related_name='employees')
    employment_type = models.CharField(max_length=15, choices=EmploymentType.choices,
                                        default=EmploymentType.FULL_TIME)
    hourly_rate     = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    address         = models.TextField(blank=True)
    joined_date     = models.DateField()
    photo           = models.ImageField(upload_to='staff/photos/', blank=True, null=True)
    is_active       = models.BooleanField(default=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Attendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = 'PRESENT', 'Present'
        ABSENT  = 'ABSENT',  'Absent'
        HALF    = 'HALF',    'Half Day'
        LEAVE   = 'LEAVE',   'On Leave'

    employee      = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendances')
    date          = models.DateField()
    status        = models.CharField(max_length=10, choices=Status.choices, default=Status.PRESENT)
    check_in      = models.TimeField(null=True, blank=True)
    check_out     = models.TimeField(null=True, blank=True)
    hours_worked  = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    notes         = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['employee', 'date']
        ordering        = ['-date']

    def save(self, *args, **kwargs):
        if self.check_in and self.check_out:
            import datetime
            ci = datetime.datetime.combine(self.date, self.check_in)
            co = datetime.datetime.combine(self.date, self.check_out)
            if co < ci:
                co += datetime.timedelta(days=1)
            self.hours_worked = round((co - ci).seconds / 3600, 2)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.name} — {self.date} ({self.status})"


class StaffPayment(models.Model):
    class PaymentType(models.TextChoices):
        SALARY  = 'SALARY',  'Monthly Salary'
        ADVANCE = 'ADVANCE', 'Advance'
        BONUS   = 'BONUS',   'Bonus'
        OTHER   = 'OTHER',   'Other'

    employee       = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payments')
    payment_type   = models.CharField(max_length=10, choices=PaymentType.choices, default=PaymentType.SALARY)
    amount         = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date   = models.DateField()
    period_start   = models.DateField(null=True, blank=True)
    period_end     = models.DateField(null=True, blank=True)
    hours_worked   = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    notes          = models.TextField(blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Record in finance
        try:
            from apps.finance.models import Transaction
            Transaction.objects.get_or_create(
                reference=f"staff_payment:{self.id}",
                defaults=dict(
                    tx_type     = 'EXPENSE',
                    amount      = self.amount,
                    category    = 'STAFF_SALARY',
                    description = f"{self.payment_type} — {self.employee.name}",
                )
            )
        except Exception:
            pass

    def __str__(self):
        return f"{self.employee.name} ₹{self.amount} on {self.payment_date}"
