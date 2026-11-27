import asyncio
import smtplib
import logging
from dataclasses import dataclass
from email.message import EmailMessage
from typing import List, Optional
from app.config import settings, is_placeholder_or_empty

logger = logging.getLogger("fire_studio_api.smtp")


@dataclass
class EmailSendResult:
    """Kết quả chuẩn hóa từ dịch vụ gửi email (dùng chung cho email thử và email cảnh báo)"""
    success: bool
    mode: str      # "real" | "mock" | "error"
    status: str    # "accepted" | "simulated" | "failed"
    message: str
    error: Optional[str] = None


def _validate_real_smtp_config() -> Optional[str]:
    """
    Kiểm tra cấu hình SMTP thật khi SMTP_MOCK=false.
    Trả về chuỗi mô tả lỗi nếu thiếu hoặc chưa bật SMTP thật, ngược lại trả về None.
    Tuyệt đối không đưa giá trị mật khẩu/token vào thông báo.
    """
    if not settings.SMTP_ENABLED:
        return (
            "Chế độ gửi email thật chưa được bật (SMTP_ENABLED=false trong backend/.env). "
            "Hãy đặt SMTP_MOCK=false và SMTP_ENABLED=true kèm thông tin Gmail SMTP để gửi thật."
        )

    missing_vars: List[str] = []
    if is_placeholder_or_empty(settings.SMTP_HOST):
        missing_vars.append("SMTP_HOST")
    if not settings.SMTP_PORT or settings.SMTP_PORT <= 0:
        missing_vars.append("SMTP_PORT")
    if is_placeholder_or_empty(settings.SMTP_USER):
        missing_vars.append("SMTP_USER")
    if is_placeholder_or_empty(settings.SMTP_PASSWORD):
        missing_vars.append("SMTP_PASSWORD")

    from_candidate = (settings.SMTP_FROM_EMAIL or settings.SMTP_USER).strip()
    if is_placeholder_or_empty(from_candidate):
        missing_vars.append("SMTP_FROM_EMAIL")

    if missing_vars:
        return (
            f"Thiếu cấu hình SMTP thật trong backend/.env: {', '.join(missing_vars)}. "
            "Vui lòng điền đầy đủ thông tin Gmail SMTP và App Password rồi khởi động lại python run.py."
        )

    return None


def _normalize_smtp_password(host: str, raw_password: str) -> str:
    """Chuẩn hóa App Password Gmail (xóa khoảng trắng nhóm 4 ký tự nếu người dùng dán trực tiếp từ Google)"""
    cleaned = raw_password.strip()
    if host.strip().lower() == "smtp.gmail.com":
        compact = cleaned.replace(" ", "")
        if len(compact) == 16 and " " in cleaned:
            return compact
    return cleaned


def _sync_send_email(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str,
) -> EmailSendResult:
    """
    Hàm đồng bộ gửi email qua SMTP (chạy trong thread pool để không block asyncio loop).
    - Nếu SMTP_MOCK=true: mô phỏng gửi thư và trả về status='simulated'.
    - Nếu SMTP_MOCK=false: bắt buộc kiểm tra cấu hình SMTP thật và gửi qua Gmail/SMTP server.
      Không bao giờ tự chuyển sang mock khi thiếu cấu hình hoặc SMTP từ chối.
    """
    # 1. Chế độ mô phỏng tường minh (chỉ chạy khi SMTP_MOCK=true)
    if settings.SMTP_MOCK:
        logger.info(
            f"[SMTP MOCK / TEST MODE] Đã mô phỏng gửi email tới '{to_email}' | Tiêu đề: '{subject}'"
        )
        return EmailSendResult(
            success=True,
            mode="mock",
            status="simulated",
            message=f"Đã mô phỏng gửi email tới {to_email} (chế độ SMTP Mock đang bật, chưa gửi qua máy chủ thư thật).",
            error=None,
        )

    # 2. Chế độ gửi thật: kiểm tra cấu hình đầy đủ, không fallback sang mock
    config_error = _validate_real_smtp_config()
    if config_error:
        logger.warning(f"Không thể gửi email thật tới '{to_email}': {config_error}")
        return EmailSendResult(
            success=False,
            mode="error",
            status="failed",
            message=config_error,
            error=f"ConfigError: {config_error}",
        )

    host = settings.SMTP_HOST.strip()
    port = settings.SMTP_PORT
    user = settings.SMTP_USER.strip()
    password = _normalize_smtp_password(host, settings.SMTP_PASSWORD)
    from_addr = (settings.SMTP_FROM_EMAIL or user).strip()
    from_name = (settings.SMTP_FROM_NAME or "").strip()

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_addr}>" if from_name else from_addr
    msg["To"] = to_email

    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")

    # 3. Kết nối và gửi qua SMTP thật (không bật set_debuglevel để tránh lộ credential)
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15.0) as server:
                server.ehlo()
                server.login(user, password)
                refused = server.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15.0) as server:
                server.ehlo()
                if settings.SMTP_USE_TLS:
                    server.starttls()
                    server.ehlo()
                server.login(user, password)
                refused = server.send_message(msg)

        if refused:
            logger.error(f"Máy chủ SMTP {host}:{port} từ chối người nhận '{to_email}'.")
            return EmailSendResult(
                success=False,
                mode="error",
                status="failed",
                message=f"Máy chủ email từ chối gửi tới địa chỉ {to_email}.",
                error="SMTPRecipientsRefused: Người nhận bị máy chủ SMTP từ chối.",
            )

        logger.info(
            f"Máy chủ email {host}:{port} đã chấp nhận thư gửi tới '{to_email}'."
        )
        return EmailSendResult(
            success=True,
            mode="real",
            status="accepted",
            message=f"Máy chủ email đã chấp nhận thư gửi tới {to_email}.",
            error=None,
        )
    except smtplib.SMTPAuthenticationError as e:
        logger.error(
            f"Lỗi xác thực SMTP tại {host}:{port} (code={e.smtp_code}). Kiểm tra SMTP_USER và App Password."
        )
        return EmailSendResult(
            success=False,
            mode="error",
            status="failed",
            message=(
                f"Máy chủ email từ chối đăng nhập (mã {e.smtp_code}). "
                "Vui lòng kiểm tra SMTP_USER và Mật khẩu ứng dụng (App Password) Gmail."
            ),
            error=f"SMTPAuthenticationError ({e.smtp_code})",
        )
    except smtplib.SMTPRecipientsRefused:
        logger.error(f"Máy chủ SMTP {host}:{port} từ chối địa chỉ người nhận '{to_email}'.")
        return EmailSendResult(
            success=False,
            mode="error",
            status="failed",
            message=f"Máy chủ email từ chối địa chỉ người nhận: {to_email}.",
            error="SMTPRecipientsRefused",
        )
    except smtplib.SMTPSenderRefused as e:
        logger.error(
            f"Máy chủ SMTP {host}:{port} từ chối địa chỉ người gửi '{from_addr}' (code={e.smtp_code})."
        )
        return EmailSendResult(
            success=False,
            mode="error",
            status="failed",
            message=(
                f"Máy chủ email từ chối địa chỉ người gửi ({from_addr}). "
                "Với Gmail SMTP, hãy đặt SMTP_FROM_EMAIL trùng với SMTP_USER."
            ),
            error=f"SMTPSenderRefused ({e.smtp_code})",
        )
    except smtplib.SMTPException as e:
        logger.error(f"Lỗi SMTP từ {host}:{port}: {type(e).__name__}: {e}")
        return EmailSendResult(
            success=False,
            mode="error",
            status="failed",
            message=f"Máy chủ email từ chối gửi thư ({type(e).__name__}).",
            error=f"{type(e).__name__}: {str(e)}",
        )
    except (TimeoutError, OSError) as e:
        logger.error(f"Lỗi kết nối tới máy chủ SMTP {host}:{port}: {e}")
        return EmailSendResult(
            success=False,
            mode="error",
            status="failed",
            message=f"Không thể kết nối tới máy chủ SMTP ({host}:{port}): {str(e)}",
            error=f"ConnectionError: {str(e)}",
        )
    except Exception as e:
        logger.error(f"Lỗi không xác định khi gửi email SMTP: {type(e).__name__}: {e}")
        return EmailSendResult(
            success=False,
            mode="error",
            status="failed",
            message=f"Lỗi gửi email qua SMTP: {type(e).__name__}.",
            error=f"{type(e).__name__}: {str(e)}",
        )


async def send_email_async(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str,
) -> EmailSendResult:
    """Gửi email bất đồng bộ qua asyncio.to_thread để không làm chậm luồng nhận diện video/webcam"""
    return await asyncio.to_thread(_sync_send_email, to_email, subject, body_text, body_html)


async def send_test_email(to_email: str) -> EmailSendResult:
    """Gửi email kiểm tra kết nối SMTP độc lập với mô hình suy luận"""
    subject = "[Fire Detection Studio] Kiểm tra cấu hình nhận cảnh báo lửa"
    mode_desc = "Mô phỏng (SMTP_MOCK=true)" if settings.SMTP_MOCK else "SMTP thật"
    body_text = f"""
Xin chào,

Đây là thư kiểm tra từ Fire Detection Studio để xác nhận hộp thư của bạn ({to_email}) có thể nhận được thông báo khi phát hiện đám cháy.

Thông số hệ thống:
- Chế độ gửi thư: {mode_desc}
- Máy chủ SMTP: {settings.SMTP_HOST}:{settings.SMTP_PORT}

Bạn không cần phản hồi thư này.
    """.strip()

    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #faf6f0; margin: 0; padding: 24px; color: #292524; }}
        .card {{ max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e7e5e4; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
        .header {{ background-color: #b43403; color: #ffffff; padding: 20px 24px; }}
        .header h1 {{ margin: 0; font-size: 19px; font-weight: 700; }}
        .content {{ padding: 24px; font-size: 14.5px; line-height: 1.6; color: #44403c; }}
        .badge {{ display: inline-block; padding: 4px 10px; background: #ecfdf5; color: #047857; border-radius: 6px; font-weight: 600; font-size: 13px; }}
        .footer {{ padding: 16px 24px; background: #f5f5f4; border-top: 1px solid #e7e5e4; font-size: 12px; color: #78716c; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>Fire Detection Studio · Email Thử Nghiệm</h1>
        </div>
        <div class="content">
          <p>Xin chào,</p>
          <p>Hộp thư <strong>{to_email}</strong> đã được kết nối thành công với <strong>Fire Detection Studio</strong>.</p>
          <p>Khi có đám cháy được mô hình AI xác nhận duy trì liên tục trên luồng <strong>Video tải lên</strong> hoặc <strong>Webcam</strong>, hệ thống sẽ tự động gửi cảnh báo khẩn cấp tới địa chỉ này.</p>
          <div style="margin: 20px 0;">
            <span class="badge">Đường dẫn gửi thư: SẴN SÀNG</span>
          </div>
          <p style="font-size: 13px; color: #78716c;">(Thư kiểm tra này được gửi độc lập với quy trình suy luận mô hình).</p>
        </div>
        <div class="footer">
          Hệ thống giám sát và phát hiện sớm khói lửa AI · Fire Detection Studio
        </div>
      </div>
    </body>
    </html>
    """.strip()

    return await send_email_async(to_email, subject, body_text, body_html)


async def send_fire_alert_email(
    to_email: str,
    source_name: str,
    model_name: str,
    confirmed_time_str: str,
    playback_time_str: Optional[str] = None,
    max_confidence: float = 0.0,
) -> EmailSendResult:
    """Gửi email cảnh báo lửa chính thức khi sự kiện được backend xác nhận"""
    conf_pct = int(round(max_confidence * 100)) if max_confidence > 0 else 0
    subject = f"[CẢNH BÁO LỬA] Phát hiện đám cháy tại {source_name} ({conf_pct}%) - Fire Detection Studio"

    playback_info = f"- Mốc phát video: {playback_time_str}\n" if playback_time_str else ""
    body_text = f"""
CẢNH BÁO KHẨN CẤP: PHÁT HIỆN LỬA ĐÃ ĐƯỢC XÁC NHẬN!

Hệ thống Fire Detection Studio vừa xác nhận một sự kiện cháy với độ tin cậy cao và duy trì liên tục đủ điều kiện.

Chi tiết sự kiện:
- Nguồn phát hiện: {source_name}
- Mô hình phân tích: {model_name}
- Thời điểm xác nhận: {confirmed_time_str}
{playback_info}- Độ tin cậy tối đa: {conf_pct}%

Vui lòng kiểm tra màn hình điều khiển và khu vực giám sát ngay lập tức!
    """.strip()

    playback_html_row = (
        f"""<tr>
            <td style="padding: 8px 12px; color: #78716c; font-weight: 600;">Mốc thời gian video:</td>
            <td style="padding: 8px 12px; font-weight: 700; color: #b43403;">{playback_time_str}</td>
           </tr>"""
        if playback_time_str
        else ""
    )

    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #faf6f0; margin: 0; padding: 24px; color: #1c1917; }}
        .card {{ max-width: 580px; margin: 0 auto; background: #ffffff; border: 2px solid #dc2626; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 18px rgba(220,38,38,0.12); }}
        .header {{ background-color: #dc2626; color: #ffffff; padding: 22px 24px; }}
        .header h1 {{ margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.01em; }}
        .content {{ padding: 24px; font-size: 15px; line-height: 1.6; }}
        .alert-banner {{ background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; color: #991b1b; font-weight: 600; font-size: 14px; }}
        .table {{ width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }}
        .table tr:nth-child(even) {{ background: #fafaf9; }}
        .footer {{ padding: 16px 24px; background: #f5f5f4; border-top: 1px solid #e7e5e4; font-size: 12px; color: #78716c; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>⚠️ CẢNH BÁO LỬA · FIRE DETECTION STUDIO</h1>
        </div>
        <div class="content">
          <div class="alert-banner">
            Đám cháy đã được thuật toán AI xác nhận duy trì liên tục vượt ngưỡng an toàn.
          </div>

          <table class="table">
            <tr>
              <td style="padding: 8px 12px; color: #78716c; font-weight: 600; width: 40%;">Nguồn phát hiện:</td>
              <td style="padding: 8px 12px; font-weight: 700; color: #1c1917;">{source_name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #78716c; font-weight: 600;">Mô hình AI:</td>
              <td style="padding: 8px 12px; color: #44403c;">{model_name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; color: #78716c; font-weight: 600;">Thời điểm xác nhận:</td>
              <td style="padding: 8px 12px; font-weight: 600; color: #1c1917;">{confirmed_time_str}</td>
            </tr>
            {playback_html_row}
            <tr>
              <td style="padding: 8px 12px; color: #78716c; font-weight: 600;">Độ tin cậy tối đa:</td>
              <td style="padding: 8px 12px; font-weight: 800; color: #dc2626; font-size: 16px;">{conf_pct}%</td>
            </tr>
          </table>

          <p style="margin-top: 20px; font-size: 13.5px; color: #57534e;">
            Vui lòng kiểm tra màn hình trực quan tại Fire Detection Studio và xác minh hiện trường ngay lập tức.
          </p>
        </div>
        <div class="footer">
          Thông báo tự động từ Fire Detection Studio · Không phản hồi email này
        </div>
      </div>
    </body>
    </html>
    """.strip()

    return await send_email_async(to_email, subject, body_text, body_html)
