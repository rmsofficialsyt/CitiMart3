"""WhatsApp AI Sales Alerts & Reporting Agent package (SPEC-05)."""
from src.alerts.whatsapp_alert_agent import WhatsAppAlertAgent, ALERT_TYPES, AUDIENCES
from src.alerts.whatsapp_provider import (
    DryRunWhatsAppProvider,
    MetaCloudWhatsAppProvider,
    TwilioWhatsAppProvider,
    get_whatsapp_provider,
    normalize_indian_phone,
)

__all__ = [
    "ALERT_TYPES",
    "AUDIENCES",
    "DryRunWhatsAppProvider",
    "MetaCloudWhatsAppProvider",
    "TwilioWhatsAppProvider",
    "WhatsAppAlertAgent",
    "get_whatsapp_provider",
    "normalize_indian_phone",
]
