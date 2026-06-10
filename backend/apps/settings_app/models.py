from django.db import models


class RestaurantSettings(models.Model):
    # ── Company Information ───────────────────────────────
    company_name    = models.CharField(max_length=200, default='My Restaurant')
    company_phone   = models.CharField(max_length=20, blank=True)
    company_email   = models.EmailField(blank=True)
    company_address = models.TextField(blank=True)
    gstin           = models.CharField(max_length=20, blank=True, verbose_name='GSTIN')

    # ── Tax ───────────────────────────────────────────────
    gst_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=5.00,
        help_text='GST percentage applied to all bills'
    )

    # ── WhatsApp ──────────────────────────────────────────
    admin_whatsapp = models.CharField(
        max_length=20, blank=True,
        help_text='Admin WhatsApp number with country code (e.g. 919876543210)'
    )
    wa_api_token = models.CharField(
        max_length=500, blank=True, verbose_name='WhatsApp API Token',
        help_text='Meta WhatsApp Cloud API bearer token'
    )
    wa_phone_id = models.CharField(
        max_length=100, blank=True, verbose_name='WhatsApp Phone Number ID',
        help_text='Phone Number ID from Meta Business Suite'
    )

    # ── WhatsApp Automation Toggles ───────────────────────
    wa_billing_enabled      = models.BooleanField(
        default=False, verbose_name='Send bill after payment',
        help_text='Send itemised bill to customer on WhatsApp after payment'
    )
    wa_absent_staff_enabled = models.BooleanField(
        default=False, verbose_name='Notify absent staff',
        help_text='Send absent notification to staff member on WhatsApp'
    )
    wa_absent_admin_enabled = models.BooleanField(
        default=False, verbose_name='Notify admin on absent',
        help_text='Send absent alert to admin WhatsApp'
    )
    wa_low_stock_enabled = models.BooleanField(
        default=False, verbose_name='Low stock alert to admin',
        help_text='Send low-stock alerts to admin WhatsApp'
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Restaurant Settings'

    def __str__(self):
        return self.company_name

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # prevent deletion

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
