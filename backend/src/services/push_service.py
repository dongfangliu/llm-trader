"""Web Push notification service.

Handles VAPID key management and sending push messages to all subscribed
browsers via the Web Push protocol (RFC 8030 + VAPID).

Dependencies:
  - pywebpush  (pip install pywebpush)
  - cryptography (already pulled in by python-jose)

If pywebpush is not installed the module still imports cleanly; a warning is
logged and push sending becomes a no-op.
"""

from __future__ import annotations

import base64
import logging
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.settings import SystemSetting
from src.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional dependency: pywebpush
# ---------------------------------------------------------------------------

try:
    from pywebpush import webpush, WebPushException  # type: ignore
    _WEBPUSH_AVAILABLE = True
except ImportError:  # pragma: no cover
    logger.warning(
        "[push] pywebpush is not installed — Web Push sending is disabled. "
        "Install it with: pip install pywebpush"
    )
    _WEBPUSH_AVAILABLE = False
    webpush = None  # type: ignore
    WebPushException = Exception  # type: ignore


# ---------------------------------------------------------------------------
# VAPID key management
# ---------------------------------------------------------------------------

_SETTING_PRIVATE = "push_vapid_private"
_SETTING_PUBLIC = "push_vapid_public"


def _generate_vapid_keys() -> Tuple[str, str]:
    """Generate a new VAPID EC key pair.

    Returns
    -------
    (private_key_b64url, public_key_b64url)
        private_key_b64url — raw 32-byte private scalar, base64url-encoded
        public_key_b64url  — uncompressed 65-byte EC point (04 || X || Y),
                             base64url-encoded (the ApplicationServerKey format)
    """
    # Prefer py_vapid if available (comes with pywebpush)
    try:
        from py_vapid import Vapid  # type: ignore

        vapid = Vapid()
        vapid.generate_keys()
        # py_vapid stores the key as a cryptography EllipticCurvePrivateKey
        private_key_obj = vapid.private_key
        public_key_obj = vapid.public_key

        from cryptography.hazmat.primitives.serialization import (
            Encoding, PublicFormat, PrivateFormat, NoEncryption,
        )

        # Private: raw 32-byte scalar
        private_bytes = private_key_obj.private_bytes(
            Encoding.Raw, PrivateFormat.Raw, NoEncryption()
        )
        # Public: uncompressed point (65 bytes: 0x04 || X || Y)
        public_bytes = public_key_obj.public_bytes(
            Encoding.X962, PublicFormat.UncompressedPoint
        )

        private_b64 = base64.urlsafe_b64encode(private_bytes).rstrip(b"=").decode()
        public_b64 = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode()
        return private_b64, public_b64

    except ImportError:
        pass  # fall through to cryptography-only path

    # Fallback: use cryptography directly
    from cryptography.hazmat.primitives.asymmetric.ec import (
        generate_private_key, SECP256R1,
    )
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat, PrivateFormat, NoEncryption,
    )

    private_key_obj = generate_private_key(SECP256R1(), default_backend())
    public_key_obj = private_key_obj.public_key()

    private_bytes = private_key_obj.private_bytes(
        Encoding.Raw, PrivateFormat.Raw, NoEncryption()
    )
    public_bytes = public_key_obj.public_bytes(
        Encoding.X962, PublicFormat.UncompressedPoint
    )

    private_b64 = base64.urlsafe_b64encode(private_bytes).rstrip(b"=").decode()
    public_b64 = base64.urlsafe_b64encode(public_bytes).rstrip(b"=").decode()
    return private_b64, public_b64


async def get_or_create_vapid_keys(db: AsyncSession) -> Tuple[str, str]:
    """Return (private_key, public_key) as base64url strings.

    Reads from SystemSetting; generates and persists a fresh key pair if the
    keys are missing from the database.
    """
    private_row = await db.get(SystemSetting, _SETTING_PRIVATE)
    public_row = await db.get(SystemSetting, _SETTING_PUBLIC)

    if private_row and public_row and private_row.value and public_row.value:
        return private_row.value, public_row.value

    logger.info("[push] VAPID keys not found — generating a new key pair.")
    private_key, public_key = _generate_vapid_keys()

    if private_row:
        private_row.value = private_key
    else:
        db.add(SystemSetting(key=_SETTING_PRIVATE, value=private_key))

    if public_row:
        public_row.value = public_key
    else:
        db.add(SystemSetting(key=_SETTING_PUBLIC, value=public_key))

    await db.commit()
    logger.info("[push] VAPID keys generated and stored.")
    return private_key, public_key


async def get_vapid_public_key(db: AsyncSession) -> str:
    """Return only the VAPID public key (generates if missing)."""
    _, public_key = await get_or_create_vapid_keys(db)
    return public_key


# ---------------------------------------------------------------------------
# Sending pushes
# ---------------------------------------------------------------------------

async def send_push_to_all(
    db: AsyncSession,
    title: str,
    body: str,
    url: str = "",
) -> Tuple[int, int]:
    """Send a Web Push notification to every stored subscription.

    Subscriptions that respond with HTTP 410 Gone are deleted (browser
    unsubscribed).  All other errors are logged but do not abort the loop.

    Returns
    -------
    (sent, failed) counts
    """
    if not _WEBPUSH_AVAILABLE:
        logger.warning("[push] pywebpush not available — skipping send_push_to_all.")
        return 0, 0

    private_key, public_key = await get_or_create_vapid_keys(db)

    result = await db.execute(select(PushSubscription))
    subscriptions = result.scalars().all()

    if not subscriptions:
        logger.info("[push] No subscriptions — nothing to send.")
        return 0, 0

    import json

    data = json.dumps({"title": title, "body": body, "url": url})

    sent = 0
    failed = 0
    to_delete: list[int] = []

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth,
                    },
                },
                data=data,
                vapid_private_key=private_key,
                vapid_claims={"sub": "mailto:admin@example.com"},
            )
            sent += 1
        except WebPushException as exc:
            response = getattr(exc, "response", None)
            status_code: Optional[int] = (
                response.status_code if response is not None else None
            )
            if status_code == 410:
                logger.info(
                    "[push] Subscription gone (410), scheduling deletion: %s",
                    sub.endpoint[:60],
                )
                to_delete.append(sub.id)
            else:
                logger.error(
                    "[push] WebPushException for endpoint %s: %s (HTTP %s)",
                    sub.endpoint[:60],
                    exc,
                    status_code,
                )
            failed += 1
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "[push] Unexpected error sending to %s: %s",
                sub.endpoint[:60],
                exc,
            )
            failed += 1

    # Remove gone subscriptions
    if to_delete:
        for sub_id in to_delete:
            sub_obj = await db.get(PushSubscription, sub_id)
            if sub_obj:
                await db.delete(sub_obj)
        await db.commit()
        logger.info("[push] Removed %d stale subscription(s).", len(to_delete))

    logger.info("[push] Broadcast complete — sent=%d failed=%d", sent, failed)
    return sent, failed
