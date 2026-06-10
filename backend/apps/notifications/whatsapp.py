import logging
import requests

logger = logging.getLogger(__name__)


def _get_settings():
    from apps.settings_app.models import RestaurantSettings
    return RestaurantSettings.get_settings()


def _format_phone(phone: str) -> str:
    """Normalise phone to E.164 without + (e.g. 919876543210 for India)."""
    phone = phone.strip().replace(' ', '').replace('-', '').replace('+', '').replace('(', '').replace(')', '')
    if not phone:
        return ''
    if len(phone) == 10 and not phone.startswith('91'):
        phone = f'91{phone}'
    return phone


def send_whatsapp_message(phone: str, message: str) -> dict:
    """
    Send a plain-text WhatsApp message via Meta Cloud API.
    Returns {'success': bool, 'error': str}.
    """
    cfg = _get_settings()

    if not cfg.wa_api_token or not cfg.wa_phone_id:
        return {'success': False, 'error': 'WhatsApp API credentials not configured in Settings'}

    formatted = _format_phone(phone)
    if not formatted:
        return {'success': False, 'error': f'Invalid phone number: {phone}'}

    url = f'https://graph.facebook.com/v18.0/{cfg.wa_phone_id}/messages'
    headers = {
        'Authorization': f'Bearer {cfg.wa_api_token}',
        'Content-Type': 'application/json',
    }
    payload = {
        'messaging_product': 'whatsapp',
        'to': formatted,
        'type': 'text',
        'text': {'body': message},
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code == 200:
            return {'success': True, 'error': ''}
        return {'success': False, 'error': f'HTTP {resp.status_code}: {resp.text[:300]}'}
    except requests.RequestException as exc:
        return {'success': False, 'error': str(exc)}
