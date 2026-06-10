import logging
import datetime

logger = logging.getLogger(__name__)

TEMPLATES = {
    "bill": (
        "🧾 *Payment Confirmed*\n"
        "Order : #{order_number}\n\n"
        "*Items:*\n{items}\n\n"
        "Subtotal : ₹{subtotal}\n"
        "Tax ({tax_percent}%) : ₹{tax_amount}\n"
        "*Total   : ₹{total}*\n\n"
        "Payment : {payment_method}\n\n"
        "Thank you for dining with us! 🙏\n"
        "— {company_name}"
    ),
    "absent_staff": (
        "Dear {name},\n\n"
        "You have been marked *Absent* for {date} "
        "as no check-in was recorded by {threshold}.\n\n"
        "Please contact your manager if this is incorrect."
    ),
    "absent_admin": (
        "🚨 *Absent Alert*\n"
        "Employee : {name}\n"
        "Dept     : {dept}\n"
        "Date     : {date}\n"
        "No check-in after {threshold}.\n"
        "Auto-marked absent by system."
    ),
    "low_stock": (
        "⚠️ *Low Stock Alert* — {date}\n\n"
        "The following ingredients are running low:\n\n"
        "{items}\n\n"
        "Please reorder to avoid shortage."
    ),
}

# Maps trigger_type → Meta-approved template name (for future template messaging)
TRIGGER_TEMPLATES = {
    "bill":         "payment_bill",
    "absent_staff": "staff_absent_self",
    "absent_admin": "staff_absent_admin",
    "low_stock":    "stock_alert_admin",
}

# Maps trigger_type → RestaurantSettings toggle attribute
_TRIGGER_SETTING_KEY = {
    "bill":         "wa_billing_enabled",
    "absent_staff": "wa_absent_staff_enabled",
    "absent_admin": "wa_absent_admin_enabled",
    "low_stock":    "wa_low_stock_enabled",
}


def _normalize_phone(phone: str) -> str:
    phone = str(phone or '').strip().replace(' ', '').replace('-', '').replace('+', '').replace('(', '').replace(')', '')
    if len(phone) == 10 and not phone.startswith('91'):
        phone = f'91{phone}'
    return phone


def _is_enabled(trigger_type: str, cfg=None) -> bool:
    if cfg is None:
        from apps.settings_app.models import RestaurantSettings
        cfg = RestaurantSettings.get_settings()
    key = _TRIGGER_SETTING_KEY.get(trigger_type)
    return bool(key and getattr(cfg, key, False))


def _queue(notification_type: str, phone: str, message: str, reference: str = '') -> None:
    """Create a PENDING Notification row. The post_save signal dispatches it."""
    from .models import Notification
    phone = _normalize_phone(phone)
    if not phone:
        logger.warning('Notification skipped — no phone for type=%s ref=%s', notification_type, reference)
        return
    Notification.objects.create(
        notification_type=notification_type,
        recipient_phone=phone,
        message=message,
        reference=reference,
        status='PENDING',
    )


# ── Public send functions ──────────────────────────────────────────────────────

def send_bill_notification(order) -> None:
    if not _is_enabled('bill'):
        return
    if not order.customer_phone:
        return
    from apps.settings_app.models import RestaurantSettings
    cfg = RestaurantSettings.get_settings()
    lines = '\n'.join(
        f"  • {item.custom_name or (item.food_item.name if item.food_item else 'Item')}"
        f" ×{item.quantity}  ₹{item.line_total}"
        for item in order.items.select_related('food_item').all()
    )
    msg = TEMPLATES['bill'].format(
        order_number=order.order_number,
        items=lines,
        subtotal=order.subtotal,
        tax_percent=order.tax_percent,
        tax_amount=order.tax_amount,
        total=order.total_amount,
        payment_method=order.get_payment_method_display(),
        company_name=cfg.company_name,
    )
    _queue('BILL', order.customer_phone, msg, f'order:{order.id}')


def send_absent_staff_notification(emp, att, threshold_str: str) -> None:
    if not _is_enabled('absent_staff'):
        return
    if not emp.phone:
        return
    today = att.date if att else datetime.date.today()
    msg = TEMPLATES['absent_staff'].format(
        name=emp.name,
        date=today.strftime('%d %b %Y'),
        threshold=threshold_str,
    )
    _queue('ABSENT_STAFF', emp.phone, msg, f'attendance:{att.id}' if att else '')


def send_absent_admin_notification(emp, att, threshold_str: str) -> None:
    from apps.settings_app.models import RestaurantSettings
    cfg = RestaurantSettings.get_settings()
    if not _is_enabled('absent_admin', cfg):
        return
    if not cfg.admin_whatsapp:
        return
    today = att.date if att else datetime.date.today()
    dept = emp.department.name if emp.department else 'N/A'
    msg = TEMPLATES['absent_admin'].format(
        name=emp.name,
        dept=dept,
        date=today.strftime('%d %b %Y'),
        threshold=threshold_str,
    )
    _queue('ABSENT_ADMIN', cfg.admin_whatsapp, msg, f'attendance:{att.id}' if att else '')


def send_low_stock_notification(low_items: list) -> None:
    from apps.settings_app.models import RestaurantSettings
    cfg = RestaurantSettings.get_settings()
    if not _is_enabled('low_stock', cfg):
        return
    if not cfg.admin_whatsapp or not low_items:
        return
    lines = '\n'.join(
        f"• {s.ingredient.name}: {s.current_quantity} {s.ingredient.unit} "
        f"(min: {s.minimum_threshold} {s.ingredient.unit})"
        for s in low_items
    )
    msg = TEMPLATES['low_stock'].format(
        date=datetime.date.today().strftime('%d %b %Y'),
        items=lines,
    )
    _queue('LOW_STOCK', cfg.admin_whatsapp, msg, 'stock:scheduled_check')
