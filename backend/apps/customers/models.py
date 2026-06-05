from django.db import models


class Customer(models.Model):
    class FrequencyTag(models.TextChoices):
        HIGH   = 'HIGH',   'High Value'
        MEDIUM = 'MEDIUM', 'Regular'
        LOW    = 'LOW',    'Occasional'
        NEW    = 'NEW',    'New'

    name          = models.CharField(max_length=200)
    phone         = models.CharField(max_length=15, unique=True)
    email         = models.EmailField(blank=True)
    address       = models.TextField(blank=True)
    frequency_tag = models.CharField(max_length=10, choices=FrequencyTag.choices, default=FrequencyTag.NEW)
    total_visits  = models.IntegerField(default=0)
    total_spent   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes         = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-total_visits', '-total_spent']

    def __str__(self):
        return f"{self.name} ({self.phone})"

    def recalculate_stats(self):
        visits = self.visits.all()
        self.total_visits = visits.count()
        self.total_spent  = sum(v.amount_spent for v in visits)
        if self.total_visits >= 10:
            self.frequency_tag = self.FrequencyTag.HIGH
        elif self.total_visits >= 4:
            self.frequency_tag = self.FrequencyTag.MEDIUM
        elif self.total_visits >= 1:
            self.frequency_tag = self.FrequencyTag.LOW
        else:
            self.frequency_tag = self.FrequencyTag.NEW
        self.save(update_fields=['total_visits', 'total_spent', 'frequency_tag'])


class Visit(models.Model):
    customer     = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='visits')
    order_number = models.CharField(max_length=20, unique=True)
    amount_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    visited_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-visited_at']

    def __str__(self):
        return f"{self.customer.name} — {self.order_number}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.customer.recalculate_stats()
