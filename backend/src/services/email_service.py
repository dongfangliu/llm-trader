"""Email service — sends transactional emails via Resend (https://resend.com)."""

import logging
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
    sender = email_from or f"{app_name} <onboarding@resend.dev>"

    html_body = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background:#f5f7fa; margin:0; padding:20px;">
  <div style="max-width:480px; margin:0 auto; background:#fff;
              border-radius:12px; padding:32px; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align:center; margin-bottom:24px;">
      <span style="font-size:2rem;">📈</span>
      <h2 style="margin:8px 0 0; color:#1a1a2e; font-size:1.4rem;">{app_name}</h2>
    </div>
    <p style="color:#374151; font-size:1rem; line-height:1.6;">
      您好，{username}！
    </p>
    <p style="color:#374151; font-size:1rem; line-height:1.6;">
      感谢注册 {app_name}。请点击下方按钮验证您的邮箱，完成账号激活。
    </p>
    <div style="text-align:center; margin:28px 0;">
      <a href="{verify_url}"
         style="display:inline-block; background:#4f46e5; color:#fff;
                text-decoration:none; padding:12px 32px; border-radius:8px;
                font-size:1rem; font-weight:600;">
        验证邮箱
      </a>
    </div>
    <p style="color:#6b7280; font-size:0.875rem; line-height:1.6;">
      链接有效期为 <strong>24 小时</strong>。<br>
      如果按钮无法点击，请复制以下链接到浏览器地址栏：<br>
      <span style="word-break:break-all; color:#4f46e5;">{verify_url}</span>
    </p>
    <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;">
    <p style="color:#9ca3af; font-size:0.75rem; text-align:center;">
      若您未注册该账号，请忽略此邮件。
    </p>
  </div>
</body>
</html>
"""

    try:
        resend.Emails.send({
            "from": sender,
            "to": [to_email],
            "subject": f"【{app_name}】请验证您的邮箱",
            "html": html_body,
        })
        logger.info("Verification email sent to %s via Resend", to_email)
        return True
    except Exception as exc:
        logger.error("Resend failed for %s: %s", to_email, exc)
        return False
