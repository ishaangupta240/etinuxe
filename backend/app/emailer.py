import logging
import smtplib
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from queue import Queue
from threading import Lock, Thread
from typing import Optional

from . import config
from .models import OTPRecord, PasswordReset, User
from .timeutils import ensure_ist

logger = logging.getLogger(__name__)


class EmailDispatchError(RuntimeError):
    """Raised when an email could not be delivered."""


class EmailNotConfiguredError(EmailDispatchError):
    """Raised when SMTP credentials are missing."""


@dataclass
class EmailJob:
    to_address: str
    subject: str
    body_text: str
    body_html: Optional[str]


_EMAIL_QUEUE: "Queue[EmailJob]" = Queue()
_WORKER_LOCK = Lock()
_WORKER_STARTED = False


def _ensure_worker() -> None:
    global _WORKER_STARTED
    if _WORKER_STARTED:
        return
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        thread = Thread(target=_email_worker, name="email-dispatcher", daemon=True)
        thread.start()
        _WORKER_STARTED = True


def _email_worker() -> None:
    while True:
        job = _EMAIL_QUEUE.get()
        try:
            _deliver_email(job)
        except EmailDispatchError:
            logger.exception("Email dispatch failed for %s", job.to_address)
        finally:
            _EMAIL_QUEUE.task_done()


@contextmanager
def _smtp_client():
    if not config.EMAIL_ENABLED or not config.SMTP_HOST:
        raise EmailNotConfiguredError("SMTP configuration is incomplete")

    client: Optional[smtplib.SMTP] = None
    try:
        if config.SMTP_USE_SSL:
            client = smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=config.SMTP_TIMEOUT)
            client.ehlo()
        else:
            client = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=config.SMTP_TIMEOUT)
            client.ehlo()
            if config.SMTP_USE_TLS:
                client.starttls()
                client.ehlo()
        if config.SMTP_USERNAME:
            client.login(config.SMTP_USERNAME, config.SMTP_PASSWORD or "")
        yield client
    except Exception as exc:  # pragma: no cover - defensive logging
        raise EmailDispatchError("Failed to send email via SMTP") from exc
    finally:
        if client is not None:
            try:
                client.quit()
            except Exception:  # pragma: no cover - defensive logging
                logger.debug("Failed to close SMTP connection", exc_info=True)


def _format_timestamp(value: datetime) -> str:
    localized = ensure_ist(value)
    return localized.strftime("%d %b %Y %I:%M %p IST")


def _deliver_email(job: EmailJob) -> None:
    if not config.EMAIL_ENABLED:
        raise EmailNotConfiguredError("SMTP configuration is incomplete")

    message = EmailMessage()
    message["Subject"] = job.subject
    message["From"] = config.SMTP_SENDER
    message["To"] = job.to_address
    message.set_content(job.body_text)
    if job.body_html:
        message.add_alternative(job.body_html, subtype="html")

    with _smtp_client() as client:
        client.send_message(message)
    logger.info("Email dispatched to %s", job.to_address)


def queue_email(to_address: str, subject: str, body_text: str, body_html: Optional[str] = None) -> None:
    if not config.EMAIL_ENABLED:
        raise EmailNotConfiguredError("SMTP configuration is incomplete")
    _ensure_worker()
    _EMAIL_QUEUE.put(EmailJob(to_address=to_address, subject=subject, body_text=body_text, body_html=body_html))
    logger.debug("Queued email to %s", to_address)


def send_signup_otp(user: User, otp: OTPRecord) -> None:
    subject = "Verify your EtinuxE account"
    expires_at = _format_timestamp(otp.expires_at)
    body_text = (
        f"Hello {user.name},\n\n"
        f"Use the one-time verification code {otp.code} to activate your EtinuxE account. "
        f"This code expires at {expires_at}.\n\n"
        "If you did not request this signup, please ignore this email.\n"
    )
    body_html = (
        f"<p>Hello {user.name},</p>"
        f"<p>Use the one-time verification code <strong>{otp.code}</strong> to activate your EtinuxE account. "
        f"This code expires at <strong>{expires_at}</strong>.</p>"
        "<p>If you did not request this signup, please ignore this email.</p>"
    )
    queue_email(user.email, subject, body_text, body_html)


def send_password_reset(reset: PasswordReset) -> None:
    subject = "Reset your EtinuxE password"
    expires_at = _format_timestamp(reset.expires_at)
    reset_url = config.PASSWORD_RESET_URL
    body_text = (
        f"Hello,\n\n"
        f"A password reset was requested for {reset.email}.\n\n"
        f"Token: {reset.token}\n"
        f"Expires: {expires_at}\n\n"
        f"Visit {reset_url} and paste the token to choose a new password. "
        "If you did not request this, you can ignore this email.\n"
    )
    body_html = (
        "<p>Hello,</p>"
        f"<p>A password reset was requested for {reset.email}.</p>"
        f"<p><strong>Token:</strong> {reset.token}<br><strong>Expires:</strong> {expires_at}</p>"
        f"<p>Visit <a href=\"{reset_url}\">{reset_url}</a> and paste the token to choose a new password. "
        "If you did not request this, you can ignore this email.</p>"
    )
    queue_email(reset.email, subject, body_text, body_html)
