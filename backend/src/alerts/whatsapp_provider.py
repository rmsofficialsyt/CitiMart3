"""Pluggable WhatsApp transport providers + Indian mobile number normalization.

Supports:
  - DryRunWhatsAppProvider (default until Meta/Twilio credentials are set)
  - MetaCloudWhatsAppProvider (Meta WhatsApp Cloud API via httpx)
  - TwilioWhatsAppProvider (Twilio WhatsApp API via httpx)

Zero new external dependencies: uses httpx==0.28.1 already in requirements.txt.
"""
from __future__ import annotations

import logging
import re
import secrets
from dataclasses import dataclass
from typing import Protocol

import httpx

from config.env import env

logger = logging.getLogger(__name__)

_INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")


def normalize_indian_phone(raw: str) -> str:
    """Validate and normalize an Indian mobile number to E.164 (+91XXXXXXXXXX).

    Accepts:
      - 9876543210
      - 09876543210
      - 919876543210
      - +919876543210
    (Spaces, hyphens, and parentheses are stripped before validation.)
    """
    cleaned = re.sub(r"[\s\-()]+", "", (raw or "").strip())
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    if cleaned.startswith("91") and len(cleaned) == 12:
        local = cleaned[2:]
    elif cleaned.startswith("0") and len(cleaned) == 11:
        local = cleaned[1:]
    elif len(cleaned) == 10:
        local = cleaned
    else:
        raise ValueError(
            f"Invalid Indian mobile number {raw!r}: expected 10 digits starting with 6-9 (optional +91/0 prefix)."
        )
    if not _INDIAN_MOBILE_RE.match(local):
        raise ValueError(
            f"Invalid Indian mobile number {raw!r}: 10-digit number must start with 6, 7, 8, or 9."
        )
    return f"+91{local}"


@dataclass(frozen=True)
class SendResult:
    ok: bool
    provider: str
    recipient: str
    message_id: str | None = None
    error: str | None = None


class WhatsAppProvider(Protocol):
    name: str

    def send_text(self, to_e164: str, body: str) -> SendResult: ...


class DryRunWhatsAppProvider:
    """Safe default when Meta Business / Twilio credentials are not yet configured."""

    name = "dry_run"

    def send_text(self, to_e164: str, body: str) -> SendResult:
        msg_id = f"dry_{secrets.token_hex(6)}"
        logger.info("[WhatsApp DRY-RUN] to=%s msg_id=%s chars=%d", to_e164, msg_id, len(body))
        return SendResult(ok=True, provider=self.name, recipient=to_e164, message_id=msg_id)


class MetaCloudWhatsAppProvider:
    """Meta WhatsApp Cloud API (graph.facebook.com)."""

    name = "meta"

    def __init__(
        self,
        access_token: str,
        phone_number_id: str,
        api_version: str = "v21.0",
        template_name: str | None = None,
    ) -> None:
        self._access_token = access_token
        self._phone_number_id = phone_number_id
        self._api_version = api_version
        self._template_name = (template_name or "").strip() or None

    def send_text(self, to_e164: str, body: str) -> SendResult:
        url = f"https://graph.facebook.com/{self._api_version}/{self._phone_number_id}/messages"
        to_digits = to_e164.lstrip("+")
        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }
        if self._template_name:
            payload: dict = {
                "messaging_product": "whatsapp",
                "to": to_digits,
                "type": "template",
                "template": {
                    "name": self._template_name,
                    "language": {"code": "en"},
                    "components": [
                        {"type": "body", "parameters": [{"type": "text", "text": body[:1024]}]}
                    ],
                },
            }
        else:
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to_digits,
                "type": "text",
                "text": {"preview_url": False, "body": body[:4096]},
            }
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(url, json=payload, headers=headers)
            if resp.status_code >= 400:
                return SendResult(
                    ok=False,
                    provider=self.name,
                    recipient=to_e164,
                    error=f"HTTP {resp.status_code}: {resp.text[:240]}",
                )
            data = resp.json()
            msg_id = None
            messages = data.get("messages")
            if isinstance(messages, list) and messages:
                msg_id = messages[0].get("id")
            return SendResult(ok=True, provider=self.name, recipient=to_e164, message_id=msg_id)
        except Exception as exc:  # noqa: BLE001
            return SendResult(ok=False, provider=self.name, recipient=to_e164, error=str(exc))


class TwilioWhatsAppProvider:
    """Twilio WhatsApp Messaging API."""

    name = "twilio"

    def __init__(self, account_sid: str, auth_token: str, whatsapp_from: str) -> None:
        self._account_sid = account_sid
        self._auth_token = auth_token
        self._from = whatsapp_from if whatsapp_from.startswith("whatsapp:") else f"whatsapp:{whatsapp_from}"

    def send_text(self, to_e164: str, body: str) -> SendResult:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self._account_sid}/Messages.json"
        to_val = to_e164 if to_e164.startswith("whatsapp:") else f"whatsapp:{to_e164}"
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    url,
                    data={"From": self._from, "To": to_val, "Body": body[:1600]},
                    auth=(self._account_sid, self._auth_token),
                )
            if resp.status_code >= 400:
                return SendResult(
                    ok=False,
                    provider=self.name,
                    recipient=to_e164,
                    error=f"HTTP {resp.status_code}: {resp.text[:240]}",
                )
            data = resp.json()
            return SendResult(ok=True, provider=self.name, recipient=to_e164, message_id=data.get("sid"))
        except Exception as exc:  # noqa: BLE001
            return SendResult(ok=False, provider=self.name, recipient=to_e164, error=str(exc))


def provider_status() -> dict[str, object]:
    """Non-secret status summary for the Admin UI."""
    mode = (env.whatsapp_provider or "dry_run").strip().lower()
    meta_ready = bool(env.whatsapp_access_token and env.whatsapp_phone_number_id)
    twilio_ready = bool(env.twilio_account_sid and env.twilio_auth_token and env.twilio_whatsapp_from)
    active = mode
    if mode == "meta" and not meta_ready:
        active = "dry_run"
    elif mode == "twilio" and not twilio_ready:
        active = "dry_run"
    elif mode not in {"dry_run", "meta", "twilio"}:
        active = "dry_run"
    return {
        "configured_provider": mode,
        "active_provider": active,
        "meta_ready": meta_ready,
        "twilio_ready": twilio_ready,
        "alerts_enabled_env": bool(env.whatsapp_alerts_enabled),
    }


def get_whatsapp_provider() -> WhatsAppProvider:
    mode = (env.whatsapp_provider or "dry_run").strip().lower()
    if mode == "meta" and env.whatsapp_access_token and env.whatsapp_phone_number_id:
        return MetaCloudWhatsAppProvider(
            access_token=env.whatsapp_access_token,
            phone_number_id=env.whatsapp_phone_number_id,
            api_version=env.whatsapp_api_version,
            template_name=env.whatsapp_template_name,
        )
    if mode == "twilio" and env.twilio_account_sid and env.twilio_auth_token and env.twilio_whatsapp_from:
        return TwilioWhatsAppProvider(
            account_sid=env.twilio_account_sid,
            auth_token=env.twilio_auth_token,
            whatsapp_from=env.twilio_whatsapp_from,
        )
    if mode in {"meta", "twilio"}:
        logger.warning("WHATSAPP_PROVIDER=%s requested but credentials are missing; using dry_run.", mode)
    return DryRunWhatsAppProvider()
