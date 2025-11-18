from __future__ import annotations

from datetime import datetime, timedelta, timezone

IST_ZONE = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    """Return the current time localized to IST."""

    return datetime.now(tz=IST_ZONE)


def ensure_ist(value: datetime) -> datetime:
    """Convert a datetime to IST, assuming naive values are already in IST."""

    if value.tzinfo is None:
        return value.replace(tzinfo=IST_ZONE)
    return value.astimezone(IST_ZONE)


def parse_iso_to_ist(value: str) -> datetime:
    """Parse an ISO 8601 string and normalize it to IST."""

    candidate = value.strip()
    if not candidate:
        raise ValueError("Empty datetime string")
    normalized = candidate.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    return ensure_ist(parsed)


