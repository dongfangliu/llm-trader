"""Email service — sends transactional emails via Resend (https://resend.com)."""

import asyncio
import logging
import re
from urllib.parse import urlparse
import resend

logger = logging.getLogger(__name__)


async def send_verification_email(
    to_email: str,
    username: str,
    token: str,
    resend_api_key: str,
    email_from: str,
    app_base_url: str,
    app_name: str,
) -> bool:
    """Send email verification link to user via Resend.

    Returns True on success, False on failure.
    If RESEND_API_KEY is not configured, logs the verification URL for development use.
    """
    verify_url = f"{app_base_url.rstrip('/')}/verify-email?token={token}"

    if not resend_api_key:
        logger.warning(
            "RESEND_API_KEY not configured. Verification link for %s: %s",
            to_email,
            verify_url,
        )
        return True

    resend.api_key = resend_api_key
    # Derive email_from from APP_BASE_URL if not explicitly set
    if not email_from and app_base_url:
        # Use hostname only (no port) so the address is valid
        host = urlparse(app_base_url).hostname or ""
        email_from = f"noreply@{host}" if host else ""
    # Extract bare email address from email_from (supports "Name <addr>" format)
    email_match = re.search(r'<([^>]+)>', email_from)
    email_addr = email_match.group(1) if email_match else (email_from or "onboarding@resend.dev")
    sender = f"{app_name} <{email_addr}>"

    html_body = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>验证您的邮箱</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:480px;width:100%;">
      <tr>
        <td style="background:#1d4ed8;padding:28px 32px;text-align:center;">
          <p style="margin:0;font-size:28px;">📈</p>
          <p style="margin:8px 0 0;color:#ffffff;font-size:18px;font-weight:bold;">{app_name}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;color:#374151;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 16px;">您好，{username}，</p>
          <p style="margin:0 0 24px;">感谢注册 {app_name}。请点击下方按钮完成邮箱验证，激活您的账号。</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 24px;">
              <a href="{verify_url}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:6px;font-size:16px;font-weight:bold;">验证邮箱</a>
            </td></tr>
          </table>
          <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">链接有效期为 <strong>24 小时</strong>。若按钮无法点击，请将以下链接复制到浏览器：</p>
          <p style="margin:0;font-size:12px;color:#6b7280;word-break:break-all;">{verify_url}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af;">
          若您未注册该账号，请忽略此邮件。
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""

    text_body = (
        f"您好，{username}，\n\n"
        f"感谢注册 {app_name}。请访问以下链接完成邮箱验证（链接有效期 24 小时）：\n\n"
        f"{verify_url}\n\n"
        f"若您未注册该账号，请忽略此邮件。"
    )

    try:
        result = await asyncio.to_thread(resend.Emails.send, {
            "from": sender,
            "to": [to_email],
            "subject": f"【{app_name}】请验证您的邮箱",
            "html": html_body,
            "text": text_body,
        })
        logger.info("Verification email sent to %s via Resend: %s", to_email, result)
        return True
    except Exception as exc:
        logger.error(
            "Resend failed for %s (from=%s): %s — verify domain at resend.com/domains",
            to_email, email_addr, exc,
        )
        return False
