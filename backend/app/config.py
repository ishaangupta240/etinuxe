from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

SMTP_HOST = "mail.smtp2go.com"
SMTP_PORT = 587
SMTP_USERNAME = "extinuxe@codeclub.co.in"
SMTP_PASSWORD = "extinuxe@codeexun"
SMTP_USE_TLS = True
SMTP_USE_SSL = False
SMTP_TIMEOUT = 30
SMTP_FROM_EMAIL = "extinuxe@codeclub.co.in"
SMTP_FROM_NAME = "EtinuxE Support"
SMTP_SENDER = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>" if SMTP_FROM_NAME else SMTP_FROM_EMAIL
EMAIL_ENABLED = bool(SMTP_HOST and SMTP_FROM_EMAIL)

FRONTEND_BASE_URL = "http://localhost:5173"
PASSWORD_RESET_URL = f"{FRONTEND_BASE_URL}/login"

DEFAULT_SETTINGS = {
    "pricing_per_step": 100,
    "scale_min": 0.001,
    "scale_max": 0.5,
    "scale_step": 0.01,
    "insurance_pricing": {
        "basic": 20.0,
        "plus": 30.0,
        "premium": 60.0,
        "ultra": 80.0,
    },
    "health_bucket_multipliers": {
        "good": 1.0,
        "normal": 1.2,
        "unhealthy": 1.7,
        "extremely_unhealthy": 2.4,
    },
    "points_discount": {
        "points_per_discount_unit": 10000,
        "discount_per_unit": 30.0,
    },
}

DEFAULT_ORGANISM_STATE = {
    "hunger": 100.0,
    "metabolism": 0.0,
    "mood": "neutral",
    "last_feed": None,
    "dream_energy": 5.0,
    "toxicity_level": 0.0,
    "dream_debt": 0.0,
    "sleep_phase": "awake",
    "last_sleep": None,
    "sensitivity_threshold": 0.5,
    "toxicity_resistance": 0.5,
    "dream_tolerance": 0.5,
    "auto_sleep_enabled": True,
    "sleep_schedule_hour": 23,
    "wake_schedule_hour": 6,
    "sleep_duration_hours": 7.0,
    "sleep_session_started_at": None,
    "sleep_session_ends_at": None,
}

MOOD_THRESHOLDS = {
    "energy": {"low": 4.0, "high": 9.0},
    "toxicity": {"low": 25.0, "high": 60.0},
    "hunger": {"low": 40.0, "high": 95.0},
    "sleep_debt": {"low": 2.0, "high": 6.0},
    "hours_since_sleep": {"high": 18.0},
}

DREAM_RULES = {
    "base_probability": 0.6,
    "toxicity_bands": {"low": 25.0, "high": 60.0},
    "nightmare": {
        "energy_delta": 2.13,
        "toxicity_delta": 4.0,
        "hunger_delta": 12.0,
    },
    "happy": {
        "energy_delta": 2.3,
        "toxicity_delta": -3.5,
        "metabolism_delta": -8.0,
    },
    "neutral": {
        "energy_delta": 0.8,
        "toxicity_delta": 0.0,
        "metabolism_delta": -3.0,
    },
}

MEMORY_RULES = {
    "toxicity": {
        "base_push": 1.0,
        "positive_relief": 1.6,
        "negative_penalty": 1.3,
        "resistance_weight": 0.5,
    },
    "energy_gain": {
        "positive_valence": 0.4,
        "strength": 0.3,
    },
}

AUTO_SLEEP_RULES = {
    "enabled_by_default": True,
    "sleep_hour": 23,
    "duration_hours": 7.0,
    "default_quality": 0.7,
}

DB_FILES = {
    "admins": DATA_DIR / "admins.json",
    "users": DATA_DIR / "users.json",
    "miniaturization_requests": DATA_DIR / "miniaturization_requests.json",
    "miniaturization_tokens": DATA_DIR / "miniaturization_tokens.json",
    "dna_profiles": DATA_DIR / "dna_profiles.json",
    "dna_tokens": DATA_DIR / "dna_tokens.json",
    "personality_assessments": DATA_DIR / "personality_assessments.json",
    "organism_state": DATA_DIR / "organism_state.json",
    "settings": DATA_DIR / "settings.json",
    "otp_store": DATA_DIR / "otp_store.json",
    "payments": DATA_DIR / "payments.json",
    "password_resets": DATA_DIR / "password_resets.json",
    "support_sessions": DATA_DIR / "support_sessions.json",
    "memory_logs": DATA_DIR / "memory_logs.json",
    "memory_tokens": DATA_DIR / "memory_tokens.json",
    "memory_nodes": DATA_DIR / "memory_nodes.json",
    "dreams": DATA_DIR / "dreams.json",
    "sleep_cycles": DATA_DIR / "sleep_cycles.json",
    "organism_telemetry": DATA_DIR / "organism_telemetry.json",
    "insurance_policies": DATA_DIR / "insurance_policies.json",
}

LEGACY_DB_PATH = DATA_DIR / "db.json"

OTP_EXPIRY_MINUTES = 10
PASSWORD_RESET_EXPIRY_MINUTES = 30
