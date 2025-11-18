from __future__ import annotations

import hashlib
import hmac
import math
import random
import uuid
from datetime import datetime, timedelta, time as dtime
from typing import Any, Callable, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from . import config, emailer
from .models import (
    AdminAccount,
    AdminAccountCreate,
    AdminSettings,
    AdminUserUpdate,
    AuthRole,
    DNAProfile,
    DNAToken,
    DreamGenerationRequest,
    DreamGlyph,
    DreamRecord,
    FeedRequest,
    ForgotPasswordRequest,
    MemoryLog,
    MemoryLogInput,
    MemoryNeighbor,
    MemoryNode,
    MemoryToken,
    MiniaturizationRequest,
    MiniaturizationRequestInput,
    MiniaturizationStage,
    MiniaturizationStatus,
    MiniaturizationToken,
    OTPRecord,
    OTPVerification,
    HealthBucket,
    HealthProfileUpdate,
    HealthSurvey,
    InsurancePolicy,
    InsurancePolicyCreate,
    InsuranceTier,
    OrganismMood,
    OrganismState,
    OrganismTelemetryEntry,
    PasswordReset,
    PaymentRecord,
    PersonalityAssessment,
    ResetPasswordRequest,
    SleepCycleRecord,
    SleepCycleRequest,
    SupportAdminMessageInput,
    SupportMessage,
    SupportMessageInput,
    SupportSession,
    SupportSessionAdminUpdate,
    SupportSessionCreate,
    SupportSessionStatus,
    SettingsUpdate,
    User,
    UserCreate,
    UserStatus,
)
from .storage import read_db, write_db
from .timeutils import IST_ZONE, ensure_ist, now_ist, parse_iso_to_ist


def _now() -> datetime:
    return now_ist()


def _ist(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return ensure_ist(dt)


def _generate_otp() -> str:
    return f"{uuid.uuid4().int % 1_000_000:06d}"


def _hash_password(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _password_matches(expected_hash: str, candidate: str) -> bool:
    return bool(expected_hash) and hmac.compare_digest(expected_hash, _hash_password(candidate))


GLYPH_COLORS = [
    "amethyst",
    "celestial_blue",
    "ember",
    "lilac",
    "jade",
]
GLYPH_MOTIONS = ["swaying", "spiraling", "pulsing", "ripple", "drift"]
DREAM_EFFECTS = ["moss_weeping", "halo_shed", "tidal_whisper", "aurora_bloom"]
MEMORY_NEIGHBOR_LIMIT = 4
MAX_DREAM_ENERGY = 12.0
MAX_DNA_TOKEN_ENERGY = 10.0
HUNGER_MAX = 140.0
METABOLISM_MAX = 140.0
TOXICITY_MAX = 100.0
DREAM_DEBT_MAX = 10.0
TELEMETRY_LIMIT = 300
TELEMETRY_MIN_INTERVAL_SECONDS = 120


_AUTO_SLEEP_GUARD = False


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _average(values: List[float], fallback: float = 0.0) -> float:
    if not values:
        return fallback
    return sum(values) / len(values)


def _blend(current: float, target: float, factor: float) -> float:
    if factor <= 0.0:
        return current
    if factor >= 1.0:
        return target
    return current * (1.0 - factor) + target * factor


def _latest_by_user(records: List[Any], key: Callable[[Any], uuid.UUID], timestamp: Optional[Callable[[Any], datetime]] = None) -> List[Any]:
    latest: Dict[uuid.UUID, Any] = {}
    for record in records:
        identifier = key(record)
        if timestamp is None:
            latest[identifier] = record
            continue
        existing = latest.get(identifier)
        if existing is None or timestamp(record) >= timestamp(existing):
            latest[identifier] = record
    return list(latest.values())


def _aggregate_dna_metrics(profiles: List[DNAProfile]) -> Dict[str, float]:
    if not profiles:
        return {
            "avg_respiration": 12.0,
            "avg_energy_consumption": 1.0,
            "avg_health_score": 60.0,
            "profile_count": 0.0,
            "condition_ratio": 0.0,
        }

    latest_profiles = _latest_by_user(profiles, lambda profile: profile.user_id, lambda profile: profile.updated_at)
    avg_respiration = _average([profile.respiration_rate for profile in latest_profiles], 12.0)
    avg_energy = _average([profile.energy_consumption for profile in latest_profiles], 1.0)
    avg_health = _average([float(profile.health_score) for profile in latest_profiles], 60.0)
    medical_notes = sum(1 for profile in latest_profiles if profile.medical_history)
    condition_ratio = medical_notes / len(latest_profiles) if latest_profiles else 0.0

    return {
        "avg_respiration": avg_respiration,
        "avg_energy_consumption": avg_energy,
        "avg_health_score": avg_health,
        "profile_count": float(len(latest_profiles)),
        "condition_ratio": condition_ratio,
    }


def _aggregate_personality_metrics(assessments: List[PersonalityAssessment], baseline: OrganismState) -> Dict[str, float]:
    if not assessments:
        return {
            "emotion_score": 0.0,
            "emotion_intensity": 0.0,
            "avg_sensitivity": baseline.sensitivity_threshold,
            "avg_toxicity_resistance": baseline.toxicity_resistance,
            "avg_dream_tolerance": baseline.dream_tolerance,
        }

    latest_assessments = _latest_by_user(assessments, lambda item: item.user_id)
    emotion_scores: List[float] = []
    emotion_intensity: List[float] = []
    sensitivity: List[float] = []
    toxicity_resistance: List[float] = []
    dream_tolerance: List[float] = []

    for record in latest_assessments:
        values = list(record.emotional_profile.values()) if record.emotional_profile else []
        if values:
            emotion_scores.append(sum(values) / len(values))
            emotion_intensity.append(sum(abs(value) for value in values) / len(values))
        if record.sensitivity_threshold is not None:
            sensitivity.append(record.sensitivity_threshold)
        if record.toxicity_resistance is not None:
            toxicity_resistance.append(record.toxicity_resistance)
        if record.dream_tolerance is not None:
            dream_tolerance.append(record.dream_tolerance)

    return {
        "emotion_score": _average(emotion_scores, 0.0),
        "emotion_intensity": _average(emotion_intensity, 0.0),
        "avg_sensitivity": _average(sensitivity, baseline.sensitivity_threshold) if sensitivity else baseline.sensitivity_threshold,
        "avg_toxicity_resistance": _average(toxicity_resistance, baseline.toxicity_resistance) if toxicity_resistance else baseline.toxicity_resistance,
        "avg_dream_tolerance": _average(dream_tolerance, baseline.dream_tolerance) if dream_tolerance else baseline.dream_tolerance,
    }


def _derive_assessment_traits(assessment: PersonalityAssessment) -> Tuple[PersonalityAssessment, bool]:
    emotional_values = list((assessment.emotional_profile or {}).values())
    intensity = _average([abs(value) for value in emotional_values], 0.0)
    positive_bias = _average([value for value in emotional_values if value > 0], 0.0)
    negative_bias = _average([-value for value in emotional_values if value < 0], 0.0)

    narrative_bonus = 0.08 if assessment.narrative else 0.0

    sensitivity = _clamp(0.38 + intensity * 0.45 - negative_bias * 0.18 + narrative_bonus * 0.4, 0.0, 1.0)
    toxicity = _clamp(0.46 + positive_bias * 0.14 - negative_bias * 0.24 + narrative_bonus * 0.6, 0.0, 1.0)
    dream_tolerance = _clamp(0.42 + positive_bias * 0.32 + intensity * 0.22 + narrative_bonus * 0.7, 0.0, 1.0)

    computed = {
        "sensitivity_threshold": round(sensitivity, 3),
        "toxicity_resistance": round(toxicity, 3),
        "dream_tolerance": round(dream_tolerance, 3),
    }

    def _differs(current: Optional[float], new_value: float) -> bool:
        return current is None or abs(current - new_value) > 0.001

    needs_update = (
        _differs(assessment.sensitivity_threshold, computed["sensitivity_threshold"])
        or _differs(assessment.toxicity_resistance, computed["toxicity_resistance"])
        or _differs(assessment.dream_tolerance, computed["dream_tolerance"])
    )

    if not needs_update:
        return assessment, False

    return assessment.model_copy(update=computed), True


def _aggregate_memory_metrics(memory_logs: List[MemoryLog]) -> Dict[str, float]:
    if not memory_logs:
        return {
            "avg_valence": 0.0,
            "avg_strength": 0.0,
            "avg_toxicity": 0.0,
            "recent_toxicity": 0.0,
        }

    recent = sorted(memory_logs, key=lambda entry: ensure_ist(entry.timestamp), reverse=True)[:30]
    avg_valence = _average([entry.valence for entry in recent], 0.0)
    avg_strength = _average([entry.strength for entry in recent], 0.0)
    avg_toxicity = _average([entry.toxicity for entry in recent], 0.0)

    total_weight = 0.0
    weighted_toxicity = 0.0

    now = _now()
    for entry in recent:
        timestamp = ensure_ist(entry.timestamp)
        hours = max(0.0, (now - timestamp).total_seconds() / 3600)
        weight = _clamp(1.0 - hours / 72.0, 0.2, 1.0)
        weighted_toxicity += entry.toxicity * weight
        total_weight += weight
    recent_toxicity = weighted_toxicity / total_weight if total_weight else avg_toxicity

    return {
        "avg_valence": avg_valence,
        "avg_strength": avg_strength,
        "avg_toxicity": avg_toxicity,
        "recent_toxicity": recent_toxicity,
    }


def _aggregate_sleep_metrics(cycles: List[SleepCycleRecord], last_sleep: Optional[datetime]) -> Dict[str, Optional[float]]:
    if not cycles:
        hours_since_cycle: Optional[float] = None
        avg_quality = 0.6
        avg_duration = 6.0
    else:
        ordered = sorted(cycles, key=lambda entry: ensure_ist(entry.occurred_at), reverse=True)
        latest = ordered[0]
        latest_occurred = ensure_ist(latest.occurred_at)
        hours_since_cycle = max(0.0, (_now() - latest_occurred).total_seconds() / 3600)
        avg_quality = _average([entry.quality for entry in ordered[:10]], 0.6)
        avg_duration = _average([entry.duration_hours for entry in ordered[:10]], 6.0)

    if last_sleep is not None:
        hours_since_last_sleep = max(0.0, (_now() - ensure_ist(last_sleep)).total_seconds() / 3600)
    else:
        hours_since_last_sleep = hours_since_cycle

    return {
        "avg_quality": avg_quality,
        "avg_duration": avg_duration,
        "hours_since_last_cycle": hours_since_cycle,
        "hours_since_last_sleep": hours_since_last_sleep,
    }


def _aggregate_dna_energy(tokens: List[DNAToken]) -> Dict[str, float]:
    if not tokens:
        return {"total_energy": 0.0, "avg_energy": 0.0, "active_tokens": 0.0}

    reserves = [max(0.0, token.remaining_energy) for token in tokens]
    active = [reserve for reserve in reserves if reserve > 0]
    total_energy = sum(reserves)
    avg_energy = total_energy / len(active) if active else 0.0

    return {
        "total_energy": total_energy,
        "avg_energy": avg_energy,
        "active_tokens": float(len(active)),
    }


def _ensure_auto_sleep_state(db: Dict[str, Any], state: Optional[OrganismState] = None) -> OrganismState:
    global _AUTO_SLEEP_GUARD

    base_state = state or OrganismState.model_validate(db["organism_state"])
    base_state = base_state.model_copy()
    base_state.last_feed = _ist(base_state.last_feed)
    base_state.last_sleep = _ist(base_state.last_sleep)
    base_state.sleep_session_started_at = _ist(base_state.sleep_session_started_at)
    base_state.sleep_session_ends_at = _ist(base_state.sleep_session_ends_at)
    if not getattr(base_state, "auto_sleep_enabled", config.AUTO_SLEEP_RULES["enabled_by_default"]):
        return base_state

    rules = config.AUTO_SLEEP_RULES
    sleep_hour = getattr(base_state, "sleep_schedule_hour", rules["sleep_hour"])
    sleep_hour = max(0, min(23, sleep_hour))
    duration_hours = getattr(base_state, "sleep_duration_hours", rules["duration_hours"])
    duration_hours = max(0.5, duration_hours)
    desired_wake_hour = int((sleep_hour + duration_hours) % 24)

    changes = False
    if base_state.sleep_schedule_hour != sleep_hour:
        base_state.sleep_schedule_hour = sleep_hour
        changes = True
    if base_state.sleep_duration_hours != duration_hours:
        base_state.sleep_duration_hours = duration_hours
        changes = True
    if base_state.wake_schedule_hour != desired_wake_hour:
        base_state.wake_schedule_hour = desired_wake_hour
        changes = True

    now = _now()
    window_start_today = datetime.combine(now.date(), dtime(hour=sleep_hour, tzinfo=IST_ZONE))
    duration_delta = timedelta(hours=duration_hours)
    window_start = window_start_today if now >= window_start_today else window_start_today - timedelta(days=1)
    window_end = window_start + duration_delta

    session_start = base_state.sleep_session_started_at
    session_end = base_state.sleep_session_ends_at

    # Finalise sleep when the stored window has elapsed.
    if (
        session_start
        and session_end
        and now >= session_end
        and not _AUTO_SLEEP_GUARD
    ):
        base_state.sleep_session_started_at = None
        base_state.sleep_session_ends_at = None
        if base_state.sleep_phase == "sleeping":
            base_state.sleep_phase = "awake"
        db["organism_state"] = base_state.model_dump(mode="json")

        actual_duration = max(0.5, (session_end - session_start).total_seconds() / 3600)
        _AUTO_SLEEP_GUARD = True
        try:
            run_sleep_cycle(
                SleepCycleRequest(
                    duration_hours=actual_duration,
                    quality=rules["default_quality"],
                    abrupt_wake=False,
                )
            )
        finally:
            _AUTO_SLEEP_GUARD = False

        refreshed = read_db()
        db.clear()
        db.update(refreshed)
        return OrganismState.model_validate(db["organism_state"])

    if window_start <= now < window_end:
        if session_start != window_start:
            base_state.sleep_session_started_at = window_start
            base_state.sleep_session_ends_at = window_end
            changes = True
        if base_state.sleep_phase != "sleeping":
            base_state.sleep_phase = "sleeping"
            changes = True
    else:
        if session_start and now < session_start:
            base_state.sleep_session_started_at = None
            base_state.sleep_session_ends_at = None
            changes = True
        if base_state.sleep_phase == "sleeping":
            base_state.sleep_phase = "awake"
            changes = True

    if changes:
        db["organism_state"] = base_state.model_dump(mode="json")

    return base_state


def _rebuild_organism_state(db: Dict[str, Any], state: Optional[OrganismState] = None) -> OrganismState:
    base_state = state or OrganismState.model_validate(db["organism_state"])
    base_state = base_state.model_copy()
    base_state.last_feed = _ist(base_state.last_feed)
    base_state.last_sleep = _ist(base_state.last_sleep)
    base_state.sleep_session_started_at = _ist(base_state.sleep_session_started_at)
    base_state.sleep_session_ends_at = _ist(base_state.sleep_session_ends_at)

    dna_profiles = [DNAProfile.model_validate(item) for item in db.get("dna_profiles", [])]
    assessments_raw = db.get("personality_assessments", [])
    assessments: List[PersonalityAssessment] = []
    assessments_changed = False
    for item in assessments_raw:
        assessment = PersonalityAssessment.model_validate(item)
        normalized, changed = _derive_assessment_traits(assessment)
        assessments.append(normalized)
        assessments_changed = assessments_changed or changed
    if assessments_changed:
        db["personality_assessments"] = [entry.model_dump(mode="json") for entry in assessments]
    memory_logs = [MemoryLog.model_validate(item) for item in db.get("memory_logs", [])]
    sleep_cycles = [SleepCycleRecord.model_validate(item) for item in db.get("sleep_cycles", [])]
    dna_tokens = [DNAToken.model_validate(item) for item in db.get("dna_tokens", [])]

    dna_metrics = _aggregate_dna_metrics(dna_profiles)
    personality_metrics = _aggregate_personality_metrics(assessments, base_state)
    memory_metrics = _aggregate_memory_metrics(memory_logs)
    sleep_metrics = _aggregate_sleep_metrics(sleep_cycles, base_state.last_sleep)
    dna_energy_metrics = _aggregate_dna_energy(dna_tokens)

    hours_since_feed = 24.0
    if base_state.last_feed is not None:
        hours_since_feed = max(0.0, (_now() - base_state.last_feed).total_seconds() / 3600)

    energy_demand = dna_metrics["avg_energy_consumption"]
    respiration_ratio = dna_metrics["avg_respiration"] / 12.0
    health_penalty = max(0.0, 1.0 - dna_metrics["avg_health_score"] / 100.0)

    hunger_target = hours_since_feed * (1.1 + energy_demand * 0.9 + respiration_ratio * 0.4)
    hunger_target += health_penalty * 45.0
    hunger_target += memory_metrics["avg_strength"] * 8.0
    hunger_target -= sleep_metrics["avg_quality"] * 12.0
    hunger_target = _clamp(hunger_target, 0.0, HUNGER_MAX)

    metabolism_target = dna_metrics["avg_respiration"] * 5.5
    metabolism_target += energy_demand * 18.0
    metabolism_target += (1.0 - health_penalty) * 14.0
    metabolism_target += memory_metrics["avg_strength"] * 20.0
    metabolism_target = _clamp(metabolism_target, 10.0, METABOLISM_MAX)

    sensitivity = _clamp(_blend(base_state.sensitivity_threshold, personality_metrics["avg_sensitivity"], 0.6), 0.0, 1.0)
    toxicity_resistance = _clamp(_blend(base_state.toxicity_resistance, personality_metrics["avg_toxicity_resistance"], 0.5), 0.0, 1.0)
    dream_tolerance = _clamp(_blend(base_state.dream_tolerance, personality_metrics["avg_dream_tolerance"], 0.5), 0.0, 1.0)

    toxicity_pressure = memory_metrics["avg_toxicity"] * 80.0 * (1.1 - toxicity_resistance)
    toxicity_pressure += health_penalty * 18.0
    toxicity_pressure += dna_metrics["condition_ratio"] * 12.0
    toxicity_target = _clamp(toxicity_pressure, 0.0, TOXICITY_MAX)

    positive_emotion = max(0.0, personality_metrics["emotion_score"])
    dream_energy_target = 2.5 + dream_tolerance * 4.0
    dream_energy_target += dna_energy_metrics["total_energy"] * 0.05
    dream_energy_target += positive_emotion * 1.5
    dream_energy_target += sleep_metrics["avg_quality"] * 3.0
    dream_energy_target -= memory_metrics["avg_toxicity"] * 2.0
    dream_energy_target -= base_state.dream_debt * 0.6
    dream_energy_target = _clamp(dream_energy_target, 0.0, MAX_DREAM_ENERGY)

    dream_debt_target = max(0.0, 1.0 - sleep_metrics["avg_quality"]) * 4.0
    dream_debt_target += max(0.0, -personality_metrics["emotion_score"]) * 2.0
    dream_debt_target += memory_metrics["recent_toxicity"] * 2.5
    dream_debt_target -= dna_energy_metrics["avg_energy"] * 0.2
    dream_debt_target = _clamp(dream_debt_target, 0.0, DREAM_DEBT_MAX)

    sleep_phase = base_state.sleep_phase
    hours_since_cycle = sleep_metrics["hours_since_last_cycle"]
    hours_since_last_sleep = sleep_metrics["hours_since_last_sleep"]
    session_enforced = False
    if base_state.sleep_session_started_at and base_state.sleep_session_ends_at:
        now_marker = _now()
        if base_state.sleep_session_started_at <= now_marker < base_state.sleep_session_ends_at:
            sleep_phase = "sleeping"
            session_enforced = True
    if not session_enforced:
        if base_state.sleep_phase == "sleeping" and (hours_since_last_sleep is None or hours_since_last_sleep < 0.3):
            sleep_phase = "sleeping"
        elif hours_since_cycle is not None:
            if hours_since_cycle < 1.5:
                sleep_phase = "waking"
            elif hours_since_cycle > 18.0:
                sleep_phase = "deprived"
            elif sleep_metrics["avg_quality"] < 0.45:
                sleep_phase = "restless"
            else:
                sleep_phase = "awake"
        elif sleep_metrics["avg_quality"] < 0.45:
            sleep_phase = "restless"

    state_out = base_state.model_copy()
    state_out.hunger = round(_clamp(_blend(base_state.hunger, hunger_target, 0.35), 0.0, HUNGER_MAX), 3)
    state_out.metabolism = round(_clamp(_blend(base_state.metabolism, metabolism_target, 0.3), 0.0, METABOLISM_MAX), 3)
    state_out.dream_energy = round(_clamp(_blend(base_state.dream_energy, dream_energy_target, 0.25), 0.0, MAX_DREAM_ENERGY), 3)
    state_out.dream_debt = round(_clamp(_blend(base_state.dream_debt, dream_debt_target, 0.3), 0.0, DREAM_DEBT_MAX), 3)
    state_out.toxicity_level = round(_clamp(_blend(base_state.toxicity_level, toxicity_target, 0.4), 0.0, TOXICITY_MAX), 3)
    state_out.sleep_phase = sleep_phase
    state_out.sensitivity_threshold = round(sensitivity, 3)
    state_out.toxicity_resistance = round(toxicity_resistance, 3)
    state_out.dream_tolerance = round(dream_tolerance, 3)
    state_out.mood = _resolve_mood(state_out, sleep_metrics)

    return state_out


def _persist_organism_state(db: Dict[str, Any], state: Optional[OrganismState] = None) -> OrganismState:
    rebuilt = _rebuild_organism_state(db, state)
    db["organism_state"] = rebuilt.model_dump(mode="json")
    _record_telemetry_snapshot(db, rebuilt)
    return rebuilt


def _record_telemetry_snapshot(db: Dict[str, Any], state: OrganismState) -> None:
    entries_raw = list(db.get("organism_telemetry", []))
    sleep_cycles = [SleepCycleRecord.model_validate(item) for item in db.get("sleep_cycles", [])]
    sleep_metrics = _aggregate_sleep_metrics(sleep_cycles, state.last_sleep)
    sleep_hours = float(sleep_metrics.get("avg_duration") or 0.0)

    now = _now()
    snapshot = OrganismTelemetryEntry(
        timestamp=now,
        hunger=round(state.hunger, 3),
        metabolism=round(state.metabolism, 3),
        dream_energy=round(state.dream_energy, 3),
        toxicity_level=round(state.toxicity_level, 3),
        sleep_hours=round(sleep_hours, 3),
        sleep_phase=state.sleep_phase,
        dream_debt=round(state.dream_debt, 3),
    )

    if entries_raw:
        try:
            last_entry = OrganismTelemetryEntry.model_validate(entries_raw[-1])
        except Exception:
            last_entry = None
        if last_entry is not None:
            last_timestamp = ensure_ist(last_entry.timestamp)
            elapsed = (now - last_timestamp).total_seconds()
            if elapsed < TELEMETRY_MIN_INTERVAL_SECONDS:
                stable = (
                    abs(last_entry.hunger - snapshot.hunger) < 0.05
                    and abs(last_entry.metabolism - snapshot.metabolism) < 0.05
                    and abs(last_entry.dream_energy - snapshot.dream_energy) < 0.05
                    and abs(last_entry.toxicity_level - snapshot.toxicity_level) < 0.05
                    and abs(last_entry.sleep_hours - snapshot.sleep_hours) < 0.05
                    and last_entry.sleep_phase == snapshot.sleep_phase
                )
                if stable:
                    return

    entries_raw.append(snapshot.model_dump(mode="json"))
    db["organism_telemetry"] = entries_raw[-TELEMETRY_LIMIT:]


def _memory_reward(valence: float, strength: float, toxicity: float) -> float:
    return 100.0


def _health_bucket(score: int) -> HealthBucket:
    if score < 20:
        return HealthBucket.extremely_unhealthy
    if score < 60:
        return HealthBucket.unhealthy
    if score < 80:
        return HealthBucket.normal
    return HealthBucket.good


def _evaluate_health_survey(survey: HealthSurvey) -> Tuple[int, HealthBucket, str, List[str]]:
    score = 40.0
    insights: List[str] = []
    risks: List[str] = []

    sleep = survey.sleep_hours
    if 7.0 <= sleep <= 9.0:
        score += 15.0
        insights.append("Sleep duration sits within the optimal 7-9 hour band.")
    elif 6.0 <= sleep < 7.0 or 9.0 < sleep <= 10.0:
        score += 10.0
        insights.append("Sleep pattern is near the optimal range; minor refinements recommended.")
    elif 5.0 <= sleep < 6.0 or 10.0 < sleep <= 11.0:
        score += 5.0
        risks.append("sleep_irregularity")
        insights.append("Sleep duration drifts from ideal targets; consider structured bedtime routines.")
    else:
        risks.append("sleep_deficit")
        insights.append("Significant sleep disruption detected; prioritise restorative rest.")

    activity_ratio = min(1.0, survey.exercise_minutes_per_week / 210.0)
    score += 18.0 * activity_ratio
    if activity_ratio < 0.5:
        risks.append("low_activity")
        insights.append("Weekly activity falls below 150 minutes; gradual increases will stabilise metabolism.")
    else:
        insights.append("Movement targets align with guidance for metabolic balance.")

    diet_score = ((survey.diet_quality - 1) / 4.0) * 16.0
    score += diet_score
    if survey.diet_quality <= 2:
        risks.append("dietary_risk")
        insights.append("Diet quality trending low; emphasise whole foods and hydration.")
    elif survey.diet_quality >= 4:
        insights.append("Nutrient intake supports cellular resilience.")

    stress_modifier = (6 - survey.stress_level) / 5.0
    score += 12.0 * stress_modifier
    if survey.stress_level >= 4:
        risks.append("elevated_stress")
        insights.append("Heightened stress levels recorded; introduce decompression rituals.")
    else:
        insights.append("Stress responses remain within adaptive thresholds.")

    if survey.chronic_condition:
        score -= 10.0
        risks.append("chronic_condition")
        insights.append("Chronic condition disclosed; coordinate with medical oversight for stability.")
    else:
        score += 2.0

    alcohol = survey.alcohol_units_per_week
    if alcohol <= 7:
        score += 4.0
    elif alcohol <= 14:
        score += 1.0
        insights.append("Alcohol use remains moderate; continue monitoring intake.")
    else:
        score -= 6.0
        risks.append("alcohol_load")
        insights.append("Alcohol intake exceeds recommended bounds; taper to protect liver function.")

    if survey.smoker:
        score -= 12.0
        risks.append("tobacco_exposure")
        insights.append("Nicotine exposure detected; cessation strongly advised to support microvascular health.")
    else:
        score += 3.0

    mindfulness_ratio = min(1.0, survey.meditation_minutes_per_week / 180.0)
    score += 6.0 * mindfulness_ratio
    if mindfulness_ratio < 0.25:
        insights.append("Mindfulness practice is minimal; short guided sessions can offset stress load.")
    else:
        insights.append("Consistent mindfulness supports emotional regulation.")

    hydration = survey.hydration_liters_per_day
    if hydration >= 2.5:
        score += 6.0
        insights.append("Hydration levels sustain metabolic clearance.")
    elif hydration >= 1.5:
        score += 3.0
    else:
        risks.append("low_hydration")
        insights.append("Hydration falls below recommended 1.5L; increase fluid intake daily.")

    score = _clamp(score, 0.0, 100.0)
    final_score = int(round(score))
    bucket = _health_bucket(final_score)
    summary = " ".join(insights)
    return final_score, bucket, summary, sorted(set(risks))


def _build_memory_neighbors(nodes: List[MemoryNode], user_node_ids: List[uuid.UUID], new_node: MemoryNode) -> List[MemoryNeighbor]:
    recent_nodes = [node for node in nodes if node.id in user_node_ids][-MEMORY_NEIGHBOR_LIMIT:]
    neighbors: List[MemoryNeighbor] = []
    for node in recent_nodes:
        distance = abs(node.valence - new_node.valence) + abs(node.strength - new_node.strength)
        similarity = _clamp(1.0 - distance, 0.0, 1.0)
        if similarity <= 0:
            continue
        neighbors.append(MemoryNeighbor(id=node.id, weight=similarity))
    return neighbors[:MEMORY_NEIGHBOR_LIMIT]


def _memory_token_summary(logs: List[MemoryLog], tokens: List[MemoryToken]) -> Dict[str, float]:
    total_points = sum(max(0.0, log.tokens_awarded) for log in logs)
    available_points = sum(max(0.0, token.amount) for token in tokens if not token.spent)
    spent_points = sum(max(0.0, token.amount) for token in tokens if token.spent)
    return {
        "total_points": round(total_points, 3),
        "available_points": round(available_points, 3),
        "spent_points": round(spent_points, 3),
        "logs_recorded": len(logs),
        "tokens_issued": len(tokens),
    }


def _apply_sensitivity_to_state(state: OrganismState, assessment: PersonalityAssessment) -> OrganismState:
    if assessment.sensitivity_threshold is not None:
        state.sensitivity_threshold = assessment.sensitivity_threshold
    if assessment.toxicity_resistance is not None:
        state.toxicity_resistance = assessment.toxicity_resistance
    if assessment.dream_tolerance is not None:
        state.dream_tolerance = assessment.dream_tolerance
    return state


def _select_seed_nodes(nodes: List[MemoryNode], logs_by_id: Dict[uuid.UUID, MemoryLog]) -> List[MemoryNode]:
    scored = []
    for node in nodes:
        log = logs_by_id.get(node.log_id)
        if not log:
            continue
        recency_weight = 1.0
        if log:
            log_ts = ensure_ist(log.timestamp)
            age_hours = max(0.0, (_now() - log_ts).total_seconds() / 3600)
            recency_weight = _clamp(1.0 - age_hours / 72.0, 0.2, 1.0)
        score = node.strength * 1.5 + max(0.0, node.valence) - node.toxicity * 0.8 + recency_weight
        scored.append((score, node))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [node for _, node in scored[: max(2, min(3, len(scored)))] ]


def _generate_glyphs(seed_nodes: List[MemoryNode]) -> List[DreamGlyph]:
    glyphs: List[DreamGlyph] = []
    for idx, node in enumerate(seed_nodes):
        color = GLYPH_COLORS[idx % len(GLYPH_COLORS)]
        motion = GLYPH_MOTIONS[idx % len(GLYPH_MOTIONS)]
        intensity = _clamp(0.35 + node.strength * 0.5 - node.toxicity * 0.2, 0.1, 1.0)
        glyphs.append(
            DreamGlyph(
                glyph_id=f"g{idx + 1}",
                intensity=intensity,
                motion=motion,
                color=color,
                seed_nodes=[node.id],
            )
        )
    return glyphs


def _consume_memory_tokens(tokens: List[MemoryToken], count: int) -> List[MemoryToken]:
    consumed = 0
    now = _now()
    for token in tokens:
        if token.spent:
            continue
        token.spent = True
        token.spent_at = now
        consumed += 1
        if consumed >= count:
            break
    if consumed < count:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Insufficient memory tokens")
    return tokens


def _resolve_user(db: dict, user_id: uuid.UUID) -> Tuple[int, User]:
    for idx, raw in enumerate(db.get("users", [])):
        if raw["id"] == str(user_id):
            return idx, User.model_validate(raw)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


def _resolve_admin(db: dict, admin_id: uuid.UUID) -> Tuple[int, AdminAccount]:
    for idx, raw in enumerate(db.get("admins", [])):
        if raw["id"] == str(admin_id):
            return idx, AdminAccount.model_validate(raw)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")


def _load_settings(db: dict) -> AdminSettings:
    return AdminSettings.model_validate(db.get("settings", config.DEFAULT_SETTINGS))


def _public_user(user: User) -> Dict[str, Any]:
    payload = user.model_dump(mode="json")
    payload.pop("password_hash", None)
    return payload


def _public_admin(admin: AdminAccount) -> Dict[str, Any]:
    payload = admin.model_dump(mode="json")
    payload.pop("password_hash", None)
    return payload


def create_admin_account(payload: AdminAccountCreate) -> Dict[str, Any]:
    db = read_db()
    if _find_account_by_email(db, payload.email) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    now = _now()
    admin = AdminAccount(
        id=uuid.uuid4(),
        email=payload.email,
        name=payload.name,
        password_hash=_hash_password(payload.password),
        created_at=now,
        updated_at=now,
    )

    admins = db.setdefault("admins", [])
    admins.append(admin.model_dump(mode="json"))
    write_db(db)
    return _public_admin(admin)


def _find_account_by_email(db: dict, email: str) -> Optional[Tuple[AuthRole, User | AdminAccount]]:
    normalized_email = email.strip().lower()

    for raw in db.get("users", []):
        if raw.get("email", "").lower() == normalized_email:
            return AuthRole.human, User.model_validate(raw)

    for raw in db.get("admins", []):
        if raw.get("email", "").lower() == normalized_email:
            return AuthRole.admin, AdminAccount.model_validate(raw)

    return None


def _load_support_sessions(db: dict) -> List[SupportSession]:
    return [SupportSession.model_validate(item) for item in db.get("support_sessions", [])]


def _persist_support_sessions(db: dict, sessions: List[SupportSession]) -> None:
    db["support_sessions"] = [session.model_dump(mode="json") for session in sessions]


def _find_support_session(sessions: List[SupportSession], session_id: uuid.UUID) -> Tuple[int, SupportSession]:
    for idx, session in enumerate(sessions):
        if session.id == session_id:
            return idx, session
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support session not found")


def _load_insurance_policies(db: dict) -> List[InsurancePolicy]:
    return [InsurancePolicy.model_validate(item) for item in db.get("insurance_policies", [])]


def _calculate_cost(scale: float, settings: AdminSettings) -> float:
    reduction = max(0.0, 1.0 - scale)
    steps = math.ceil(reduction / settings.scale_step)
    return steps * settings.pricing_per_step


INSURANCE_UNIT_SIZE = 0.01


def _insurance_units(scale: float) -> int:
    reduction = max(0.0, 1.0 - scale)
    return max(1, math.ceil(reduction / INSURANCE_UNIT_SIZE))


def _bucket_key(bucket: HealthBucket | str) -> str:
    return bucket.value if isinstance(bucket, HealthBucket) else str(bucket)


def _bucket_multiplier(settings: AdminSettings, bucket: HealthBucket | str) -> float:
    key = _bucket_key(bucket)
    config = settings.health_bucket_multipliers
    return getattr(config, key, getattr(config, "normal", 1.0))


def _available_points(tokens_raw: List[Dict[str, Any]], user_id: uuid.UUID) -> float:
    total = 0.0
    for raw in tokens_raw:
        if raw.get("user_id") != str(user_id) or raw.get("spent"):
            continue
        total += max(0.0, float(raw.get("amount", 0.0)))
    return total


def _calculate_insurance_pricing(
    user: User,
    request: MiniaturizationRequest,
    tier: InsuranceTier,
    settings: AdminSettings,
    tokens_raw: List[Dict[str, Any]],
    *,
    redeem_points: bool,
) -> Dict[str, float]:
    units = _insurance_units(request.scale)
    base_rate = getattr(settings.insurance_pricing, tier.value)
    multiplier = _bucket_multiplier(settings, user.health_bucket)
    monthly_before_multiplier = units * base_rate
    monthly_premium = monthly_before_multiplier * multiplier

    discount_policy = settings.points_discount
    available_points = _available_points(tokens_raw, user.id)

    candidate_points = 0.0
    if (
        monthly_premium > 0
        and discount_policy.discount_per_unit > 0
        and discount_policy.points_per_discount_unit > 0
    ):
        affordable_units = int(available_points // discount_policy.points_per_discount_unit)
        if affordable_units > 0:
            max_units_by_cost = int(math.floor(monthly_premium / discount_policy.discount_per_unit))
            redemption_units = min(affordable_units, max_units_by_cost)
            candidate_points = float(redemption_units * discount_policy.points_per_discount_unit)

    points_spent = 0.0
    if candidate_points > 0:
        if redeem_points:
            points_spent = _spend_points(tokens_raw, user.id, candidate_points)
        else:
            points_spent = candidate_points

    discount_amount = 0.0
    if points_spent > 0 and discount_policy.points_per_discount_unit > 0:
        discount_amount = (
            (points_spent / discount_policy.points_per_discount_unit)
            * discount_policy.discount_per_unit
        )
        discount_amount = min(discount_amount, monthly_premium)

    final_premium = max(0.0, monthly_premium - discount_amount)

    return {
        "units": float(units),
        "base_rate_per_step": float(base_rate),
        "bucket_multiplier": float(multiplier),
        "monthly_premium": float(monthly_premium),
        "final_premium": float(final_premium),
        "points_spent": float(points_spent),
        "discount_amount": float(discount_amount),
        "available_points": float(available_points),
    }


def _spend_points(tokens_raw: List[Dict[str, Any]], user_id: uuid.UUID, points_to_spend: float) -> float:
    if points_to_spend <= 0:
        return 0.0

    now = _now()
    spent = 0.0
    eligible: List[Tuple[int, MemoryToken]] = []
    for idx, raw in enumerate(tokens_raw):
        if raw.get("user_id") != str(user_id) or raw.get("spent"):
            continue
        token = MemoryToken.model_validate(raw)
        eligible.append((idx, token))

    eligible.sort(key=lambda item: item[1].created_at)

    for idx, token in eligible:
        if spent >= points_to_spend:
            break
        remaining = points_to_spend - spent
        if token.amount <= remaining + 1e-6:
            token.spent = True
            token.spent_at = now
            spent += token.amount
            tokens_raw[idx] = token.model_dump(mode="json")
        else:
            # Split token to retain leftover points.
            spent += remaining
            consumed = remaining
            leftover = max(0.0, token.amount - consumed)
            token.spent = True
            token.spent_at = now
            token.amount = consumed
            tokens_raw[idx] = token.model_dump(mode="json")

            if leftover > 0:
                leftover_token = MemoryToken(
                    id=uuid.uuid4(),
                    user_id=token.user_id,
                    log_id=token.log_id,
                    amount=leftover,
                    created_at=token.created_at,
                    spent=False,
                    spent_at=None,
                )
                tokens_raw.append(leftover_token.model_dump(mode="json"))
            break

    return spent


def _resolve_mood(state: OrganismState, sleep_metrics: Optional[Dict[str, Optional[float]]] = None) -> OrganismMood:
    sleep_metrics = sleep_metrics or {}
    thresholds = config.MOOD_THRESHOLDS

    energy = state.dream_energy
    toxicity = state.toxicity_level
    hunger = state.hunger
    dream_debt = state.dream_debt
    hours_since_sleep = sleep_metrics.get("hours_since_last_sleep")

    energy_low = energy <= thresholds["energy"]["low"]
    energy_high = energy >= thresholds["energy"]["high"]
    toxicity_low = toxicity <= thresholds["toxicity"]["low"]
    toxicity_high = toxicity >= thresholds["toxicity"]["high"]
    hunger_low = hunger <= thresholds["hunger"]["low"]
    hunger_high = hunger >= thresholds["hunger"]["high"]

    sleep_debt_low = dream_debt <= thresholds["sleep_debt"]["low"]
    sleep_debt_high = dream_debt >= thresholds["sleep_debt"]["high"]
    overdue_sleep = bool(hours_since_sleep is not None and hours_since_sleep >= thresholds["hours_since_sleep"]["high"])

    sleep_good = sleep_debt_low and not overdue_sleep
    sleep_poor = sleep_debt_high or overdue_sleep

    if energy_low and sleep_poor and toxicity_high and hunger_high:
        return OrganismMood.angry
    if energy_low and sleep_poor and toxicity_high:
        return OrganismMood.depressed
    if energy_low and toxicity_high and sleep_good and not hunger_high:
        return OrganismMood.sad
    if energy_high and toxicity_low and sleep_good and hunger_low:
        return OrganismMood.excited
    if energy_low and toxicity_low and sleep_good and hunger_low:
        return OrganismMood.relaxed
    if not energy_low and not energy_high and toxicity_low and sleep_good and hunger_low:
        return OrganismMood.happy
    return OrganismMood.neutral


def _select_dream_category(state: OrganismState, preferred: Optional[str] = None) -> str:
    allowed = {"happy", "neutral", "nightmare"}
    if preferred in allowed:
        return preferred

    bands = config.DREAM_RULES["toxicity_bands"]
    if state.toxicity_level >= bands["high"]:
        return "nightmare"
    if state.toxicity_level <= bands["low"]:
        return "happy"
    return "neutral"


def _apply_dream_impacts(state: OrganismState, category: str) -> None:
    rules = config.DREAM_RULES
    if category == "nightmare":
        impact = rules["nightmare"]
        state.dream_energy = _clamp(state.dream_energy - impact["energy_delta"], 0.0, MAX_DREAM_ENERGY)
        state.toxicity_level = _clamp(state.toxicity_level + impact["toxicity_delta"], 0.0, TOXICITY_MAX)
        state.hunger = round(_clamp(state.hunger + impact["hunger_delta"], 0.0, HUNGER_MAX), 3)
        state.dream_debt = _clamp(state.dream_debt + 0.6, 0.0, DREAM_DEBT_MAX)
        if state.toxicity_level >= rules["toxicity_bands"]["high"] + 10.0:
            state.sleep_phase = "waking"
    elif category == "happy":
        impact = rules["happy"]
        state.dream_energy = _clamp(state.dream_energy + impact["energy_delta"], 0.0, MAX_DREAM_ENERGY)
        state.toxicity_level = _clamp(state.toxicity_level + impact["toxicity_delta"], 0.0, TOXICITY_MAX)
        state.metabolism = _clamp(state.metabolism + impact["metabolism_delta"], 0.0, METABOLISM_MAX)
        state.dream_debt = max(0.0, state.dream_debt - 0.8)
    elif category == "neutral":
        impact = rules["neutral"]
        state.dream_energy = _clamp(state.dream_energy + impact["energy_delta"], 0.0, MAX_DREAM_ENERGY)
        state.toxicity_level = _clamp(state.toxicity_level + impact["toxicity_delta"], 0.0, TOXICITY_MAX)
        state.metabolism = _clamp(state.metabolism + impact["metabolism_delta"], 0.0, METABOLISM_MAX)
        state.dream_debt = max(0.0, state.dream_debt - 0.2)


def _update_organism_from_assessment(db: Dict[str, Any], assessment: PersonalityAssessment) -> None:
    state = _ensure_auto_sleep_state(db)
    emotion_values = list(assessment.emotional_profile.values())
    emotion_score = sum(emotion_values) / len(emotion_values) if emotion_values else 0.0
    intensity = sum(abs(value) for value in emotion_values) / len(emotion_values) if emotion_values else 0.0

    state.metabolism = min(100.0, state.metabolism + max(1.0, intensity * 5))
    state.hunger = max(0.0, state.hunger - max(2.0, intensity * 4))
    state.last_feed = _now()
    state = _apply_sensitivity_to_state(state, assessment)
    sleep_cycles = [SleepCycleRecord.model_validate(item) for item in db.get("sleep_cycles", [])]
    sleep_snapshot = _aggregate_sleep_metrics(sleep_cycles, state.last_sleep)
    state.mood = _resolve_mood(state, sleep_snapshot)
    state = _persist_organism_state(db, state)


def create_user(payload: UserCreate) -> User:
    db = read_db()
    normalized_email = payload.email.lower()
    if any(u["email"].lower() == normalized_email for u in db.get("users", [])):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    now = _now()
    survey = payload.health_survey
    if survey is not None:
        health_score, health_bucket, health_summary, health_risks = _evaluate_health_survey(survey)
    else:
        health_score = 60
        health_bucket = HealthBucket.normal
        health_summary = None
        health_risks: List[str] = []
    respiration_rate = payload.respiration_rate if payload.respiration_rate is not None else 12.0
    energy_consumption = payload.energy_consumption if payload.energy_consumption is not None else 1.0
    user = User(
        id=uuid.uuid4(),
        email=payload.email,
        name=payload.name,
        location=payload.location,
        body_profile=payload.body_profile,
        status=UserStatus.pending_verification,
        current_stage=MiniaturizationStage.signup,
        created_at=now,
        updated_at=now,
        password_hash=_hash_password(payload.password),
        respiration_rate=respiration_rate,
        energy_consumption=energy_consumption,
        medical_history=payload.medical_history,
        health_score=health_score,
        health_bucket=health_bucket,
        initial_insurance_tier=payload.initial_insurance_tier,
        initial_insurance_activated=False,
    )

    otp = OTPRecord(
        user_id=user.id,
        code=_generate_otp(),
        expires_at=now + timedelta(minutes=config.OTP_EXPIRY_MINUTES),
    )
    user.otp_id = otp.id

    try:
        emailer.send_signup_otp(user, otp)
    except emailer.EmailDispatchError as exc:  # pragma: no cover - network failure
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deliver verification email") from exc

    db.setdefault("users", []).append(user.model_dump(mode="json"))
    db.setdefault("otp_store", []).append(otp.model_dump(mode="json"))
    if survey is not None:
        dna_profile = DNAProfile(
            id=uuid.uuid4(),
            user_id=user.id,
            respiration_rate=respiration_rate,
            energy_consumption=energy_consumption,
            medical_history=payload.medical_history,
            health_score=health_score,
            health_bucket=health_bucket,
            created_at=now,
            updated_at=now,
            health_summary=health_summary,
            health_risks=health_risks,
            health_inputs=survey,
        )
        db.setdefault("dna_profiles", []).append(dna_profile.model_dump(mode="json"))
    write_db(db)
    return user


def update_health_profile(user_id: uuid.UUID, payload: HealthProfileUpdate) -> Tuple[User, DNAProfile]:
    db = read_db()
    index, user = _resolve_user(db, user_id)
    now = _now()

    health_score, health_bucket, health_summary, health_risks = _evaluate_health_survey(payload.health_survey)

    user.body_profile = payload.body_profile
    user.respiration_rate = payload.respiration_rate
    user.energy_consumption = payload.energy_consumption
    user.medical_history = payload.medical_history
    user.health_score = health_score
    user.health_bucket = health_bucket
    user.updated_at = now
    db["users"][index] = user.model_dump(mode="json")

    dna_profiles = db.setdefault("dna_profiles", [])
    existing_idx: Optional[int] = None
    existing_profile: Optional[DNAProfile] = None
    for idx, raw in enumerate(dna_profiles):
        if raw["user_id"] == str(user_id):
            existing_idx = idx
            existing_profile = DNAProfile.model_validate(raw)
            break

    if existing_profile is not None and existing_idx is not None:
        dna_profile = DNAProfile(
            id=existing_profile.id,
            user_id=existing_profile.user_id,
            respiration_rate=payload.respiration_rate,
            energy_consumption=payload.energy_consumption,
            medical_history=payload.medical_history,
            health_score=health_score,
            health_bucket=health_bucket,
            created_at=existing_profile.created_at,
            updated_at=now,
            health_summary=health_summary,
            health_risks=health_risks,
            health_inputs=payload.health_survey,
        )
        dna_profiles[existing_idx] = dna_profile.model_dump(mode="json")
    else:
        dna_profile = DNAProfile(
            id=uuid.uuid4(),
            user_id=user.id,
            respiration_rate=payload.respiration_rate,
            energy_consumption=payload.energy_consumption,
            medical_history=payload.medical_history,
            health_score=health_score,
            health_bucket=health_bucket,
            created_at=now,
            updated_at=now,
            health_summary=health_summary,
            health_risks=health_risks,
            health_inputs=payload.health_survey,
        )
        dna_profiles.append(dna_profile.model_dump(mode="json"))

    write_db(db)
    return user, dna_profile


def verify_user(payload: OTPVerification) -> User:
    db = read_db()
    otp_records = db.get("otp_store", [])
    otp_record = next(
        (o for o in otp_records if o["user_id"] == str(payload.user_id) and o["code"] == payload.otp_code),
        None,
    )
    if not otp_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP")

    if otp_record.get("consumed"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP already used")

    if parse_iso_to_ist(otp_record["expires_at"]) < _now():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired")

    users = db.get("users", [])
    user_idx = next((idx for idx, u in enumerate(users) if u["id"] == str(payload.user_id)), None)
    if user_idx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user = User.model_validate(users[user_idx])
    user.status = UserStatus.verified
    user.current_stage = MiniaturizationStage.verified
    user.updated_at = _now()

    db["users"][user_idx] = user.model_dump(mode="json")
    otp_record["consumed"] = True
    write_db(db)
    return user


def submit_miniaturization_request(user_id: uuid.UUID, payload: MiniaturizationRequestInput) -> MiniaturizationRequest:
    db = read_db()
    idx, user = _resolve_user(db, user_id)

    if user.status != UserStatus.verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User not verified")

    settings = _load_settings(db)
    if not (settings.scale_min <= payload.scale <= settings.scale_max):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scale outside permitted range")

    cost = _calculate_cost(payload.scale, settings)
    now = _now()
    request = MiniaturizationRequest(
        id=uuid.uuid4(),
        user_id=user_id,
        scale=payload.scale,
        safety_answers=payload.safety_answers,
        cost_usd=cost,
        created_at=now,
        updated_at=now,
    )

    db.setdefault("miniaturization_requests", []).append(request.model_dump(mode="json"))
    user.current_stage = MiniaturizationStage.request_submitted
    user.updated_at = now
    db["users"][idx] = user.model_dump(mode="json")

    write_db(db)
    return request


def record_personality(payload: PersonalityAssessment) -> Tuple[PersonalityAssessment, DNAToken]:
    db = read_db()
    idx, user = _resolve_user(db, payload.user_id)

    payload, _ = _derive_assessment_traits(payload)

    now = _now()
    checksum_source = f"{payload.user_id}{payload.emotional_profile}{payload.narrative}{now.isoformat()}"
    checksum = hashlib.sha256(checksum_source.encode()).hexdigest()

    emotional_profile = payload.emotional_profile or {}
    emotional_intensity = _average([abs(value) for value in emotional_profile.values()], 0.0)
    dream_tolerance = payload.dream_tolerance or 0.5
    toxicity_resistance = payload.toxicity_resistance or 0.5
    dynamic_energy = 4.0 + emotional_intensity * 3.0
    dynamic_energy += dream_tolerance * 3.0
    dynamic_energy += toxicity_resistance * 1.5
    remaining_energy = round(_clamp(dynamic_energy, 3.0, MAX_DNA_TOKEN_ENERGY), 3)

    dna_token = DNAToken(
        id=uuid.uuid4(),
        user_id=payload.user_id,
        payload_checksum=checksum,
        encrypted_blob=hashlib.sha256(checksum.encode()).hexdigest(),
        created_at=now,
        remaining_energy=remaining_energy,
    )

    db.setdefault("personality_assessments", []).append(payload.model_dump(mode="json"))
    db.setdefault("dna_tokens", []).append(dna_token.model_dump(mode="json"))

    user.current_stage = MiniaturizationStage.assessment_complete
    user.updated_at = now
    db["users"][idx] = user.model_dump(mode="json")

    _update_organism_from_assessment(db, payload)

    write_db(db)
    return payload, dna_token


def record_payment(user_id: uuid.UUID, request_id: uuid.UUID, amount: float) -> PaymentRecord:
    db = read_db()
    user_idx, user = _resolve_user(db, user_id)

    request = next(
        (MiniaturizationRequest.model_validate(r) for r in db.get("miniaturization_requests", []) if r["id"] == str(request_id)),
        None,
    )
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniaturization request not found")

    if amount < request.cost_usd:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient payment amount")

    payment = PaymentRecord(
        id=uuid.uuid4(),
        user_id=user_id,
        request_id=request_id,
        amount_usd=amount,
    )

    db.setdefault("payments", []).append(payment.model_dump(mode="json"))

    user.current_stage = MiniaturizationStage.payment_captured
    user.updated_at = _now()
    db["users"][user_idx] = user.model_dump(mode="json")
    write_db(db)
    return payment


def create_insurance_policy(payload: InsurancePolicyCreate) -> Dict[str, Any]:
    db = read_db()
    user_idx, user = _resolve_user(db, payload.user_id)

    request = next(
        (MiniaturizationRequest.model_validate(r) for r in db.get("miniaturization_requests", []) if r["id"] == str(payload.request_id)),
        None,
    )
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniaturization request not found")
    if request.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request does not belong to user")

    tier = InsuranceTier(payload.tier)
    settings = _load_settings(db)
    allowed_statuses = {MiniaturizationStatus.approved, MiniaturizationStatus.completed}
    if request.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insurance is available once a request is approved or completed",
        )
    policies_raw = db.setdefault("insurance_policies", [])
    active_policy: Optional[InsurancePolicy] = None
    scheduled_idx: Optional[int] = None
    for idx, raw in enumerate(policies_raw):
        if raw.get("request_id") != str(request.id):
            continue
        status = raw.get("status")
        if status == "active":
            active_policy = InsurancePolicy.model_validate(raw)
        elif status == "scheduled":
            scheduled_idx = idx

    if active_policy and active_policy.tier == tier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insurance policy already active at this tier",
        )

    tokens_raw = db.setdefault("memory_tokens", [])
    is_scheduled_change = active_policy is not None
    pricing = _calculate_insurance_pricing(
        user,
        request,
        tier,
        settings,
        tokens_raw,
        redeem_points=not is_scheduled_change,
    )

    if scheduled_idx is not None:
        previous_scheduled = InsurancePolicy.model_validate(policies_raw[scheduled_idx])
        previous_scheduled.status = "cancelled"
        policies_raw[scheduled_idx] = previous_scheduled.model_dump(mode="json")

    if active_policy is not None:
        effective_at = active_policy.next_billing_at or (_now() + timedelta(days=30))
        policy_status = "scheduled"
        next_billing_at = effective_at
    else:
        effective_at = _now()
        policy_status = "active"
        next_billing_at = _now() + timedelta(days=30)

    policy = InsurancePolicy(
        user_id=user.id,
        request_id=request.id,
        tier=tier,
        scale=request.scale,
        steps=int(pricing["units"]),
        base_rate_per_step=pricing["base_rate_per_step"],
        health_bucket=user.health_bucket,
        bucket_multiplier=pricing["bucket_multiplier"],
        points_redeemed=pricing["points_spent"],
        points_value_usd=round(pricing["discount_amount"], 2),
        monthly_premium=max(0.01, round(pricing["monthly_premium"], 2)),
        final_premium=round(pricing["final_premium"], 2),
        status=policy_status,  # type: ignore[arg-type]
        next_billing_at=next_billing_at,
        effective_at=effective_at,
    )

    policies_raw.append(policy.model_dump(mode="json"))

    payment_record: Optional[PaymentRecord] = None
    if policy_status == "active" and pricing["final_premium"] > 0:
        payment_record = PaymentRecord(
            id=uuid.uuid4(),
            user_id=user.id,
            request_id=request.id,
            amount_usd=round(pricing["final_premium"], 2),
        )
        db.setdefault("payments", []).append(payment_record.model_dump(mode="json"))

    db["users"][user_idx] = user.model_dump(mode="json")
    write_db(db)

    response: Dict[str, Any] = {
        "policy": policy.model_dump(mode="json"),
        "discount": {
            "points_spent": round(pricing["points_spent"], 2),
            "value_usd": round(pricing["discount_amount"], 2),
        },
        "pricing": {
            "tier": tier.value,
            "steps": policy.steps,
            "base_rate_per_step": round(pricing["base_rate_per_step"], 2),
            "bucket_multiplier": round(pricing["bucket_multiplier"], 3),
            "monthly_premium": round(pricing["monthly_premium"], 2),
            "final_premium": round(pricing["final_premium"], 2),
            "points_redeemed": round(pricing["points_spent"], 2),
            "discount_value_usd": round(pricing["discount_amount"], 2),
            "points_available": round(pricing["available_points"], 2),
        },
    }
    if active_policy is not None:
        response["replaced_policy_id"] = str(active_policy.id)
    response["activation_mode"] = "scheduled" if policy_status == "scheduled" else "immediate"
    response["effective_at"] = effective_at.isoformat()
    response["payment"] = payment_record.model_dump(mode="json") if payment_record else None
    return response


def _auto_activate_initial_insurance(user_id: uuid.UUID, request_id: uuid.UUID) -> None:
    db = read_db()
    try:
        user_idx, user = _resolve_user(db, user_id)
    except HTTPException:
        return

    if getattr(user, "initial_insurance_activated", False):
        return

    tier = getattr(user, "initial_insurance_tier", InsuranceTier.basic)
    request = next(
        (MiniaturizationRequest.model_validate(r) for r in db.get("miniaturization_requests", []) if r["id"] == str(request_id)),
        None,
    )
    if request is None or request.user_id != user.id or request.status != MiniaturizationStatus.completed:
        return

    policies = _load_insurance_policies(db)
    for policy in policies:
        if policy.request_id == request.id and policy.status in {"active", "scheduled"}:
            user.initial_insurance_activated = True
            db["users"][user_idx] = user.model_dump(mode="json")
            write_db(db)
            return

    payload = InsurancePolicyCreate(user_id=user.id, request_id=request.id, tier=tier)
    try:
        create_insurance_policy(payload)
    except HTTPException:
        return

    refreshed = read_db()
    refreshed_user_idx, refreshed_user = _resolve_user(refreshed, user_id)
    refreshed_user.initial_insurance_activated = True
    refreshed["users"][refreshed_user_idx] = refreshed_user.model_dump(mode="json")
    write_db(refreshed)


def preview_insurance_policy(payload: InsurancePolicyCreate) -> Dict[str, Any]:
    db = read_db()
    _, user = _resolve_user(db, payload.user_id)

    request = next(
        (MiniaturizationRequest.model_validate(r) for r in db.get("miniaturization_requests", []) if r["id"] == str(payload.request_id)),
        None,
    )
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniaturization request not found")
    if request.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request does not belong to user")

    tier = InsuranceTier(payload.tier)
    settings = _load_settings(db)
    allowed_statuses = {MiniaturizationStatus.approved, MiniaturizationStatus.completed}
    tokens_snapshot = list(db.get("memory_tokens", []))
    pricing = _calculate_insurance_pricing(
        user,
        request,
        tier,
        settings,
        tokens_snapshot,
        redeem_points=False,
    )

    policies = _load_insurance_policies(db)
    active_policy = next((policy for policy in policies if policy.request_id == request.id and policy.status == "active"), None)
    scheduled_policy = next((policy for policy in policies if policy.request_id == request.id and policy.status == "scheduled"), None)

    activation_mode = "scheduled" if active_policy is not None else "immediate"
    effective_at: Optional[str] = None
    if activation_mode == "scheduled":
        base_dt = active_policy.next_billing_at or (active_policy.created_at + timedelta(days=30))
        effective_at = ensure_ist(base_dt).isoformat()

    quote = {
        "tier": tier.value,
        "steps": int(pricing["units"]),
        "base_rate_per_step": round(pricing["base_rate_per_step"], 2),
        "bucket_multiplier": round(pricing["bucket_multiplier"], 3),
        "monthly_premium": round(pricing["monthly_premium"], 2),
        "final_premium": round(pricing["final_premium"], 2),
        "points_redeemed": round(pricing["points_spent"], 2),
        "discount_value_usd": round(pricing["discount_amount"], 2),
        "points_available": round(pricing["available_points"], 2),
    }

    return {
        "quote": quote,
        "has_active_policy": active_policy is not None,
        "active_policy_tier": active_policy.tier.value if active_policy else None,
        "eligible": request.status in allowed_statuses,
        "request_status": request.status.value,
        "activation_mode": activation_mode,
        "effective_at": effective_at,
        "scheduled_policy_tier": scheduled_policy.tier.value if scheduled_policy else None,
    }


def _load_memory_payloads(db: Dict[str, Any]) -> Tuple[List[MemoryLog], List[MemoryToken], List[MemoryNode]]:
    logs = [MemoryLog.model_validate(item) for item in db.get("memory_logs", [])]
    tokens = [MemoryToken.model_validate(item) for item in db.get("memory_tokens", [])]
    nodes = [MemoryNode.model_validate(item) for item in db.get("memory_nodes", [])]
    return logs, tokens, nodes


def record_memory_log(user_id: uuid.UUID, payload: MemoryLogInput) -> Tuple[MemoryLog, MemoryToken, MemoryNode]:
    db = read_db()
    _resolve_user(db, user_id)

    state = _ensure_auto_sleep_state(db)
    logs, tokens, nodes = _load_memory_payloads(db)
    now = _now()
    timestamp = ensure_ist(payload.timestamp) if payload.timestamp else now
    anchor_time = max(timestamp, now)
    body = payload.memory_text.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Memory text cannot be empty")

    recent_user_logs = [entry for entry in logs if entry.user_id == user_id]
    if recent_user_logs:
        latest_log = max(recent_user_logs, key=lambda entry: ensure_ist(entry.timestamp))
        latest_timestamp = ensure_ist(latest_log.timestamp)
        if anchor_time - latest_timestamp < timedelta(hours=1):
            next_window = latest_timestamp + timedelta(hours=1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Memory uplinks unlock after {next_window.isoformat()}",
            )

    timestamp = anchor_time

    reward = _memory_reward(payload.valence, payload.strength, payload.toxicity)
    log = MemoryLog(
        id=uuid.uuid4(),
        user_id=user_id,
        timestamp=timestamp,
        valence=payload.valence,
        strength=payload.strength,
        toxicity=payload.toxicity,
        embedding=payload.embedding,
        memory_text=body,
        tokens_awarded=reward,
    )

    token = MemoryToken(
        id=uuid.uuid4(),
        user_id=user_id,
        log_id=log.id,
        amount=reward,
    )

    logs_by_id = {entry.id: entry for entry in logs}
    user_node_ids = [node.id for node in nodes if logs_by_id.get(node.log_id) and logs_by_id[node.log_id].user_id == user_id]
    node = MemoryNode(
        id=uuid.uuid4(),
        log_id=log.id,
        valence=payload.valence,
        strength=payload.strength,
        toxicity=payload.toxicity,
        energy_reserve=max(0.05, payload.strength * (1.0 - payload.toxicity * 0.6)),
    )
    node.neighbors = _build_memory_neighbors(nodes, user_node_ids, node)

    logs.append(log)
    tokens.append(token)
    nodes.append(node)

    db["memory_logs"] = [entry.model_dump(mode="json") for entry in logs]
    db["memory_tokens"] = [entry.model_dump(mode="json") for entry in tokens]
    db["memory_nodes"] = [entry.model_dump(mode="json") for entry in nodes]

    memory_rules = config.MEMORY_RULES
    toxicity_rules = memory_rules["toxicity"]
    base_push = payload.toxicity * toxicity_rules["base_push"]
    affect = payload.valence * payload.strength
    relief = max(0.0, affect) * toxicity_rules["positive_relief"]
    penalty = max(0.0, -affect) * toxicity_rules["negative_penalty"]
    intake_scale = max(0.0, 1.0 - state.toxicity_resistance * toxicity_rules["resistance_weight"])
    toxicity_delta = (base_push + penalty) * intake_scale - relief
    state.toxicity_level = _clamp(state.toxicity_level + toxicity_delta, 0.0, TOXICITY_MAX)

    energy_rules = memory_rules["energy_gain"]
    energy_gain = max(0.0, payload.valence) * energy_rules["positive_valence"]
    energy_gain += payload.strength * energy_rules["strength"]
    state.dream_energy = _clamp(state.dream_energy + energy_gain, 0.0, MAX_DREAM_ENERGY)
    state = _persist_organism_state(db, state)

    write_db(db)
    return log, token, node


def list_memory_logs(user_id: Optional[uuid.UUID] = None) -> List[MemoryLog]:
    logs = [MemoryLog.model_validate(item) for item in read_db().get("memory_logs", [])]
    if user_id is not None:
        logs = [entry for entry in logs if entry.user_id == user_id]
    return logs


def list_memory_tokens(user_id: Optional[uuid.UUID] = None) -> List[MemoryToken]:
    tokens = [MemoryToken.model_validate(item) for item in read_db().get("memory_tokens", [])]
    if user_id is not None:
        tokens = [entry for entry in tokens if entry.user_id == user_id]
    return tokens


def update_memory_token_status(token_id: uuid.UUID, spent: bool) -> MemoryToken:
    db = read_db()
    tokens = [MemoryToken.model_validate(item) for item in db.get("memory_tokens", [])]
    for idx, token in enumerate(tokens):
        if token.id != token_id:
            continue
        if token.spent != spent:
            token.spent = spent
            token.spent_at = _now() if spent else None
            tokens[idx] = token
            db["memory_tokens"] = [entry.model_dump(mode="json") for entry in tokens]
            write_db(db)
        return token
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory token not found")


def list_dreams() -> List[DreamRecord]:
    return [DreamRecord.model_validate(item) for item in read_db().get("dreams", [])]


def list_sleep_cycles(limit: int = 50) -> List[SleepCycleRecord]:
    cycles = [SleepCycleRecord.model_validate(item) for item in read_db().get("sleep_cycles", [])]
    if limit is not None:
        return cycles[-limit:]
    return cycles


def generate_dream(payload: Optional[DreamGenerationRequest] = None) -> DreamRecord:
    request = payload or DreamGenerationRequest()
    db = read_db()
    state_snapshot = _ensure_auto_sleep_state(db)
    logs_raw, tokens_raw, nodes_raw = _load_memory_payloads(db)
    if not logs_raw or not nodes_raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No memory data available")

    available_tokens = [token for token in tokens_raw if not token.spent]
    if not available_tokens and not request.force:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No available memory tokens")

    state = state_snapshot
    if state.sleep_phase != "sleeping" or state.sleep_session_started_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dreams can only be generated during sleep")
    dna_tokens = [DNAToken.model_validate(raw) for raw in db.get("dna_tokens", [])]
    active_dna_tokens = [token for token in dna_tokens if token.remaining_energy > 0]

    combined_energy = state.dream_energy + sum(token.remaining_energy for token in active_dna_tokens)
    max_energy_constraint = request.max_energy if request.max_energy is not None else None
    if max_energy_constraint is not None:
        combined_energy = min(combined_energy, max_energy_constraint)

    if combined_energy <= 0 and not request.force:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dream energy depleted")

    logs_by_id = {entry.id: entry for entry in logs_raw}
    seed_nodes = _select_seed_nodes(nodes_raw, logs_by_id)
    if not seed_nodes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to resolve seed nodes")

    avg_valence = _average([node.valence for node in seed_nodes])
    avg_strength = _average([node.strength for node in seed_nodes])
    avg_toxicity = _average([node.toxicity for node in seed_nodes])

    desired_token_use = max(1, math.ceil(avg_strength * 2) or 1)
    tokens_to_consume = min(len(available_tokens), desired_token_use)
    if tokens_to_consume == 0 and not request.force:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Memory tokens exhausted")
    base_energy_cost = _clamp(0.6 + avg_strength + avg_toxicity * 0.5, 0.3, 4.0)

    if combined_energy < base_energy_cost and not request.force:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Insufficient dream energy for request")

    probability = config.DREAM_RULES["base_probability"]
    if not request.force:
        probability = _clamp(probability + avg_valence * 0.05 - avg_toxicity * 0.05, 0.05, 0.95)
    else:
        probability = 1.0

    success = random.random() <= probability
    if request.force:
        success = True

    outcome = "success" if success else "failure"
    category = "dormant"
    if success:
        category = _select_dream_category(state, request.preferred_category)

    glyphs = _generate_glyphs(seed_nodes) if success else []
    intensity = _clamp(0.4 + avg_strength * 0.5 + max(0.0, avg_valence) * 0.2 - avg_toxicity * 0.2, 0.1, 1.0)
    if not success:
        intensity = 0.2

    effects = []
    if success:
        if category == "nightmare":
            effects.extend([random.choice(DREAM_EFFECTS), "skin_shed"])
        elif category == "happy":
            effects.extend(["aurora_bloom", random.choice(DREAM_EFFECTS)])
        else:
            effects.extend([random.choice(DREAM_EFFECTS), "tidal_whisper"])
    else:
        effects.append("signal_drift")

    energy_multiplier = 1.5 if success and category == "nightmare" else 1.0
    total_energy_cost = base_energy_cost * energy_multiplier
    if max_energy_constraint is not None:
        total_energy_cost = min(total_energy_cost, max_energy_constraint)

    remaining_cost = total_energy_cost
    # Tap organism reserves first and fall back to DNA token energy.
    state_energy_used = min(state.dream_energy, remaining_cost)
    state.dream_energy = _clamp(state.dream_energy - state_energy_used, 0.0, MAX_DREAM_ENERGY)
    remaining_cost -= state_energy_used

    dna_energy_used = 0.0
    if remaining_cost > 0 and active_dna_tokens:
        for token in active_dna_tokens:
            available = max(0.0, token.remaining_energy)
            if available <= 0:
                continue
            draw = min(available, remaining_cost)
            token.remaining_energy = round(max(0.0, available - draw), 6)
            dna_energy_used += draw
            remaining_cost -= draw
            if remaining_cost <= 0:
                break

    if remaining_cost > 0:
        if request.force:
            total_energy_cost -= remaining_cost
        else:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Insufficient combined energy reserves")

    total_energy_cost = max(0.0, total_energy_cost)
    energy_used = total_energy_cost
    state.sleep_phase = "dreaming" if success else "restless"

    if success:
        _apply_dream_impacts(state, category)
    else:
        state.dream_debt = _clamp(state.dream_debt + 0.3, 0.0, DREAM_DEBT_MAX)

    db["dna_tokens"] = [token.model_dump(mode="json") for token in dna_tokens]
    state = _persist_organism_state(db, state)

    if tokens_to_consume > 0:
        updated_tokens = _consume_memory_tokens(tokens_raw, tokens_to_consume)
        db["memory_tokens"] = [entry.model_dump(mode="json") for entry in updated_tokens]

    record = DreamRecord(
        id=uuid.uuid4(),
        seed_node_ids=[node.id for node in seed_nodes],
        glyphs=glyphs,
        intensity=intensity,
        effects=effects,
        energy_used=energy_used,
        category=category,
        outcome=outcome,
        memory_tokens_consumed=tokens_to_consume,
        dna_energy_used=round(dna_energy_used, 3),
        state_energy_used=round(state_energy_used, 3),
    )

    dreams = [DreamRecord.model_validate(item) for item in db.get("dreams", [])]
    dreams.append(record)
    db["dreams"] = [entry.model_dump(mode="json") for entry in dreams]

    write_db(db)
    return record


def run_sleep_cycle(payload: Optional[SleepCycleRequest] = None) -> Tuple[OrganismState, List[MemoryNode]]:
    request = payload or SleepCycleRequest()
    db = read_db()
    state = OrganismState.model_validate(db["organism_state"])
    nodes = [MemoryNode.model_validate(item) for item in db.get("memory_nodes", [])]
    dna_tokens = [DNAToken.model_validate(item) for item in db.get("dna_tokens", [])]

    state.sleep_phase = "sleeping"
    regen = request.duration_hours * (0.4 + request.quality)
    if request.abrupt_wake:
        regen *= 0.6
        state.dream_debt += 0.4
    state.dream_energy = _clamp(state.dream_energy + regen, 0.0, MAX_DREAM_ENERGY)

    detox = request.duration_hours * request.quality * 0.05
    state.toxicity_level = max(0.0, state.toxicity_level - detox)
    state.last_sleep = _now()

    detox_per_node = detox * 0.25
    for node in nodes:
        node.toxicity = max(0.0, node.toxicity - detox_per_node)

    # Sleeping replenishes DNA token energy in parallel with organism recovery.
    regen_per_token = request.duration_hours * request.quality * 0.4
    if request.abrupt_wake:
        regen_per_token *= 0.5
    for token in dna_tokens:
        token.remaining_energy = round(_clamp(token.remaining_energy + regen_per_token, 0.0, MAX_DNA_TOKEN_ENERGY), 6)

    existing_cycles = [SleepCycleRecord.model_validate(item) for item in db.get("sleep_cycles", [])]
    cycle = SleepCycleRecord(
        duration_hours=request.duration_hours,
        quality=request.quality,
        abrupt_wake=request.abrupt_wake,
    )
    existing_cycles.append(cycle)

    db["sleep_cycles"] = [entry.model_dump(mode="json") for entry in existing_cycles[-50:]]
    db["memory_nodes"] = [entry.model_dump(mode="json") for entry in nodes]
    db["dna_tokens"] = [entry.model_dump(mode="json") for entry in dna_tokens]
    state = _persist_organism_state(db, state)

    write_db(db)
    return state, nodes


def issue_token(user_id: uuid.UUID, request_id: uuid.UUID, dna_token_id: uuid.UUID) -> MiniaturizationToken:
    db = read_db()
    idx, user = _resolve_user(db, user_id)

    request = next(
        (MiniaturizationRequest.model_validate(r) for r in db.get("miniaturization_requests", []) if r["id"] == str(request_id)),
        None,
    )
    if not request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniaturization request not found")

    dna_token = next((DNAToken.model_validate(t) for t in db.get("dna_tokens", []) if t["id"] == str(dna_token_id)), None)
    if not dna_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="DNA token not found")

    now = _now()
    token = MiniaturizationToken(
        id=uuid.uuid4(),
        user_id=user_id,
        request_id=request_id,
        dna_token_id=dna_token_id,
        status=MiniaturizationStatus.awaiting_approval,
        created_at=now,
        updated_at=now,
    )

    db.setdefault("miniaturization_tokens", []).append(token.model_dump(mode="json"))
    user.current_stage = MiniaturizationStage.awaiting_procedure
    user.updated_at = now
    db["users"][idx] = user.model_dump(mode="json")

    write_db(db)
    return token


def list_users() -> List[Dict[str, Any]]:
    return [_public_user(User.model_validate(u)) for u in read_db().get("users", [])]


def admin_update_user(user_id: uuid.UUID, payload: AdminUserUpdate) -> Dict[str, Any]:
    db = read_db()
    user_idx, user = _resolve_user(db, user_id)
    now = _now()
    changed = False

    if payload.name is not None and payload.name != user.name:
        user.name = payload.name
        changed = True

    if payload.email is not None and payload.email != user.email:
        existing = _find_account_by_email(db, payload.email)
        if existing is not None:
            role, account = existing
            is_same_user = role == AuthRole.human and isinstance(account, User) and account.id == user.id
            if not is_same_user:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
        user.email = payload.email
        changed = True

    if payload.location is not None and payload.location != user.location:
        user.location = payload.location
        changed = True

    if payload.status is not None and payload.status != user.status:
        user.status = payload.status
        changed = True

    if payload.current_stage is not None and payload.current_stage != user.current_stage:
        user.current_stage = payload.current_stage
        changed = True

    dna_profile_idx: Optional[int] = None
    dna_profile: Optional[DNAProfile] = None
    dna_profiles_raw = db.get("dna_profiles", [])
    for idx, raw_profile in enumerate(dna_profiles_raw):
        if raw_profile.get("user_id") == str(user.id):
            dna_profile_idx = idx
            dna_profile = DNAProfile.model_validate(raw_profile)
            break

    def _touch_dna_profile() -> None:
        nonlocal dna_profile, dna_profile_idx
        if dna_profile is None or dna_profile_idx is None:
            return
        dna_profile.updated_at = now
        dna_profiles_raw[dna_profile_idx] = dna_profile.model_dump(mode="json")

    if payload.health_score is not None and payload.health_score != user.health_score:
        user.health_score = payload.health_score
        user.health_bucket = _health_bucket(payload.health_score)
        changed = True
        if dna_profile is not None:
            dna_profile.health_score = payload.health_score
            dna_profile.health_bucket = user.health_bucket
            _touch_dna_profile()

    if payload.health_bucket is not None and payload.health_bucket != user.health_bucket:
        user.health_bucket = payload.health_bucket
        changed = True
        if dna_profile is not None:
            dna_profile.health_bucket = payload.health_bucket
            _touch_dna_profile()

    if payload.respiration_rate is not None and payload.respiration_rate != user.respiration_rate:
        user.respiration_rate = payload.respiration_rate
        changed = True
        if dna_profile is not None:
            dna_profile.respiration_rate = payload.respiration_rate
            _touch_dna_profile()

    if payload.energy_consumption is not None and payload.energy_consumption != user.energy_consumption:
        user.energy_consumption = payload.energy_consumption
        changed = True
        if dna_profile is not None:
            dna_profile.energy_consumption = payload.energy_consumption
            _touch_dna_profile()

    if payload.medical_history is not None and payload.medical_history != user.medical_history:
        user.medical_history = payload.medical_history
        changed = True
        if dna_profile is not None:
            dna_profile.medical_history = payload.medical_history
            _touch_dna_profile()

    if not changed:
        return _public_user(user)

    user.updated_at = now
    db.setdefault("users", [])
    db["users"][user_idx] = user.model_dump(mode="json")
    write_db(db)
    return _public_user(user)


def list_tokens() -> List[MiniaturizationToken]:
    return [MiniaturizationToken.model_validate(t) for t in read_db().get("miniaturization_tokens", [])]


def list_insurance_policies(user_id: Optional[uuid.UUID] = None) -> List[InsurancePolicy]:
    records = _load_insurance_policies(read_db())
    if user_id is not None:
        records = [policy for policy in records if policy.user_id == user_id]
    return records


def update_request_health_rating(request_id: uuid.UUID, rating: int) -> Dict[str, Any]:
    db = read_db()
    request_idx: Optional[int] = None
    request_obj: Optional[MiniaturizationRequest] = None
    for idx, raw in enumerate(db.get("miniaturization_requests", [])):
        if raw.get("id") != str(request_id):
            continue
        request_idx = idx
        request_obj = MiniaturizationRequest.model_validate(raw)
        break

    if request_idx is None or request_obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Miniaturization request not found")

    if request_obj.status == MiniaturizationStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed requests cannot receive a health rating",
        )

    now = _now()
    request_obj.staff_health_rating = rating
    request_obj.staff_health_rating_at = now
    request_obj.updated_at = now
    requests_raw = db.setdefault("miniaturization_requests", [])
    requests_raw[request_idx] = request_obj.model_dump(mode="json")

    user_idx, user = _resolve_user(db, request_obj.user_id)
    user.health_score = rating
    user.health_bucket = _health_bucket(rating)
    user.updated_at = now
    db["users"][user_idx] = user.model_dump(mode="json")

    dna_profiles_raw = db.setdefault("dna_profiles", [])
    updated_profile_dump: Optional[Dict[str, Any]] = None
    for idx, raw_profile in enumerate(dna_profiles_raw):
        if raw_profile.get("user_id") != str(user.id):
            continue
        profile = DNAProfile.model_validate(raw_profile)
        profile.health_score = rating
        profile.health_bucket = _health_bucket(rating)
        profile.updated_at = now
        updated_profile_dump = profile.model_dump(mode="json")
        dna_profiles_raw[idx] = updated_profile_dump
        break

    if updated_profile_dump is None:
        profile = DNAProfile(
            id=uuid.uuid4(),
            user_id=user.id,
            respiration_rate=user.respiration_rate,
            energy_consumption=user.energy_consumption,
            medical_history=user.medical_history,
            health_score=rating,
            health_bucket=_health_bucket(rating),
            created_at=now,
            updated_at=now,
            health_summary=None,
            health_risks=[],
            health_inputs=None,
        )
        updated_profile_dump = profile.model_dump(mode="json")
        dna_profiles_raw.append(updated_profile_dump)

    write_db(db)

    response: Dict[str, Any] = {
        "request": request_obj.model_dump(mode="json"),
        "user": _public_user(user),
    }
    if updated_profile_dump is not None:
        response["dna_profile"] = updated_profile_dump
    return response


def list_requests(user_id: Optional[uuid.UUID] = None) -> List[MiniaturizationRequest]:
    records = [MiniaturizationRequest.model_validate(r) for r in read_db().get("miniaturization_requests", [])]
    if user_id is not None:
        records = [item for item in records if item.user_id == user_id]
    return records


def list_payments(user_id: Optional[uuid.UUID] = None) -> List[PaymentRecord]:
    records = [PaymentRecord.model_validate(r) for r in read_db().get("payments", [])]
    if user_id is not None:
        records = [item for item in records if item.user_id == user_id]
    return records


def list_dna_tokens(user_id: Optional[uuid.UUID] = None) -> List[DNAToken]:
    records = [DNAToken.model_validate(r) for r in read_db().get("dna_tokens", [])]
    if user_id is not None:
        records = [item for item in records if item.user_id == user_id]
    return records


def list_assessments(user_id: Optional[uuid.UUID] = None) -> List[PersonalityAssessment]:
    records = [PersonalityAssessment.model_validate(r) for r in read_db().get("personality_assessments", [])]
    if user_id is not None:
        records = [item for item in records if item.user_id == user_id]
    return records


def get_user_overview(user_id: uuid.UUID) -> Dict[str, Any]:
    db = read_db()
    _, user = _resolve_user(db, user_id)

    requests = [MiniaturizationRequest.model_validate(r) for r in db.get("miniaturization_requests", []) if r["user_id"] == str(user_id)]
    payments = [PaymentRecord.model_validate(r) for r in db.get("payments", []) if r["user_id"] == str(user_id)]
    dna_tokens = [DNAToken.model_validate(r) for r in db.get("dna_tokens", []) if r["user_id"] == str(user_id)]
    dna_profiles = [DNAProfile.model_validate(r) for r in db.get("dna_profiles", []) if r["user_id"] == str(user_id)]
    mini_tokens = [MiniaturizationToken.model_validate(r) for r in db.get("miniaturization_tokens", []) if r["user_id"] == str(user_id)]
    assessments = [PersonalityAssessment.model_validate(r) for r in db.get("personality_assessments", []) if r["user_id"] == str(user_id)]
    memory_logs = [MemoryLog.model_validate(r) for r in db.get("memory_logs", []) if r["user_id"] == str(user_id)]
    memory_tokens = [MemoryToken.model_validate(r) for r in db.get("memory_tokens", []) if r["user_id"] == str(user_id)]
    insurance_policies = [policy.model_dump(mode="json") for policy in _load_insurance_policies(db) if policy.user_id == user.id]

    memory_logs_sorted = sorted(memory_logs, key=lambda entry: ensure_ist(entry.timestamp), reverse=True)
    memory_tokens_sorted = sorted(memory_tokens, key=lambda entry: entry.created_at, reverse=True)
    memory_summary = _memory_token_summary(memory_logs, memory_tokens)
    dna_profile = dna_profiles[-1] if dna_profiles else None
    bucket_value = user.health_bucket.value if isinstance(user.health_bucket, HealthBucket) else str(user.health_bucket)
    health_profile = {
        "health_score": user.health_score,
        "health_bucket": bucket_value,
        "bucket_label": bucket_value.replace("_", " ").title(),
        "medical_history": user.medical_history,
        "respiration_rate": (dna_profile.respiration_rate if dna_profile else user.respiration_rate),
        "energy_consumption": (dna_profile.energy_consumption if dna_profile else user.energy_consumption),
        "profile_id": str(dna_profile.id) if dna_profile else None,
        "updated_at": dna_profile.updated_at.isoformat() if dna_profile else None,
        "health_summary": dna_profile.health_summary if dna_profile else None,
        "health_risks": dna_profile.health_risks if dna_profile else [],
        "health_inputs": dna_profile.health_inputs.model_dump(mode="json") if dna_profile and dna_profile.health_inputs else None,
    }

    return {
        "user": _public_user(user),
        "requests": [item.model_dump(mode="json") for item in requests],
        "payments": [item.model_dump(mode="json") for item in payments],
        "dna_tokens": [item.model_dump(mode="json") for item in dna_tokens],
        "dna_profile": dna_profile.model_dump(mode="json") if dna_profile else None,
        "miniaturization_tokens": [item.model_dump(mode="json") for item in mini_tokens],
        "assessments": [item.model_dump(mode="json") for item in assessments],
        "memory_logs": [item.model_dump(mode="json") for item in memory_logs_sorted[:20]],
        "memory_tokens": [item.model_dump(mode="json") for item in memory_tokens_sorted[:40]],
        "memory_summary": memory_summary,
        "health_profile": health_profile,
        "insurance_policies": insurance_policies,
    }


def get_admin_overview() -> Dict[str, Any]:
    db = read_db()
    organism = _persist_organism_state(db)
    users = [User.model_validate(u) for u in db.get("users", [])]
    requests = [MiniaturizationRequest.model_validate(r) for r in db.get("miniaturization_requests", [])]
    payments = [PaymentRecord.model_validate(r) for r in db.get("payments", [])]
    tokens = [MiniaturizationToken.model_validate(t) for t in db.get("miniaturization_tokens", [])]
    dna_tokens = [DNAToken.model_validate(t) for t in db.get("dna_tokens", [])]
    dna_profiles = [DNAProfile.model_validate(t) for t in db.get("dna_profiles", [])]
    memories = [MemoryLog.model_validate(item) for item in db.get("memory_logs", [])]
    memory_tokens = [MemoryToken.model_validate(item) for item in db.get("memory_tokens", [])]
    dreams = [DreamRecord.model_validate(item) for item in db.get("dreams", [])]
    sleep_cycles = [SleepCycleRecord.model_validate(item) for item in db.get("sleep_cycles", [])]
    insurance_policies = _load_insurance_policies(db)

    revenue = sum(payment.amount_usd for payment in payments)
    pending_tokens = [t for t in tokens if t.status == MiniaturizationStatus.awaiting_approval]
    approved_tokens = [t for t in tokens if t.status == MiniaturizationStatus.approved]

    total_dna_energy = sum(max(0.0, token.remaining_energy) for token in dna_tokens)
    avg_sleep_quality = _average([cycle.quality for cycle in sleep_cycles[-20:]], 0.0)
    memory_totals = _memory_token_summary(memories, memory_tokens)
    avg_respiration = _average([profile.respiration_rate for profile in dna_profiles], 0.0)
    avg_energy_consumption = _average([profile.energy_consumption for profile in dna_profiles], 0.0)
    avg_health_score = _average([float(profile.health_score) for profile in dna_profiles], 0.0)
    bucket_counts = {bucket.value: 0 for bucket in HealthBucket}
    for profile in dna_profiles:
        key = profile.health_bucket.value if isinstance(profile.health_bucket, HealthBucket) else str(profile.health_bucket)
        bucket_counts.setdefault(key, 0)
        bucket_counts[key] += 1

    payload = {
        "users": [_public_user(u) for u in users],
        "requests": [r.model_dump(mode="json") for r in requests],
        "payments": [p.model_dump(mode="json") for p in payments],
        "miniaturization_tokens": [t.model_dump(mode="json") for t in tokens],
        "dna_tokens": [t.model_dump(mode="json") for t in dna_tokens],
        "dna_profiles": [t.model_dump(mode="json") for t in dna_profiles],
        "memory_logs": [m.model_dump(mode="json") for m in memories[-50:]],
        "memory_tokens": [t.model_dump(mode="json") for t in memory_tokens[-80:]],
        "dreams": [d.model_dump(mode="json") for d in dreams[-30:]],
        "sleep_cycles": [c.model_dump(mode="json") for c in sleep_cycles[-30:]],
        "insurance_policies": [p.model_dump(mode="json") for p in insurance_policies],
        "summary": {
            "total_users": len(users),
            "total_requests": len(requests),
            "total_payments": len(payments),
            "total_revenue": revenue,
            "pending_tokens": len(pending_tokens),
            "approved_tokens": len(approved_tokens),
            "memory_logs": len(memories),
            "memory_tokens": len(memory_tokens),
            "dreams": len(dreams),
            "dream_energy": round(organism.dream_energy, 3),
            "dna_energy": round(total_dna_energy, 3),
            "sleep_cycles": len(sleep_cycles),
            "avg_sleep_quality": round(avg_sleep_quality, 3),
            "memory_points_total": memory_totals["total_points"],
            "memory_points_available": memory_totals["available_points"],
            "memory_points_spent": memory_totals["spent_points"],
            "avg_respiration_rate": round(avg_respiration, 3),
            "avg_energy_consumption": round(avg_energy_consumption, 3),
            "avg_health_score": round(avg_health_score, 3),
            "health_bucket_distribution": bucket_counts,
            "insurance_policies": len(insurance_policies),
            "insurance_recurring_revenue": round(
                sum(policy.final_premium for policy in insurance_policies if policy.status == "active"),
                2,
            ),
        },
        "settings": _load_settings(db).model_dump(),
        "organism_state": organism.model_dump(mode="json"),
    }

    write_db(db)
    return payload


def get_admin_settings() -> AdminSettings:
    return AdminSettings.model_validate(read_db().get("settings", config.DEFAULT_SETTINGS))


def update_admin_settings(update: SettingsUpdate) -> AdminSettings:
    db = read_db()
    settings = _load_settings(db)
    new_data = settings.model_dump()
    for field in ("pricing_per_step", "scale_min", "scale_max", "scale_step"):
        value = getattr(update, field)
        if value is not None:
            new_data[field] = value

    if update.insurance_pricing is not None:
        new_data["insurance_pricing"] = update.insurance_pricing.model_dump()
    if update.health_bucket_multipliers is not None:
        new_data["health_bucket_multipliers"] = update.health_bucket_multipliers.model_dump()
    if update.points_discount is not None:
        new_data["points_discount"] = update.points_discount.model_dump()

    settings = AdminSettings.model_validate(new_data)
    db["settings"] = settings.model_dump()
    write_db(db)
    return settings


def authenticate(email: str, password: str) -> Dict[str, Any]:
    db = read_db()
    normalized_email = email.strip().lower()

    for raw in db.get("users", []):
        if raw.get("email", "").lower() != normalized_email:
            continue
        user = User.model_validate(raw)
        if not _password_matches(user.password_hash, password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        if user.status != UserStatus.verified:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account pending verification")
        return {
            "role": "human",
            "user": _public_user(user),
        }

    for raw in db.get("admins", []):
        if raw.get("email", "").lower() != normalized_email:
            continue
        admin = AdminAccount.model_validate(raw)
        if _password_matches(admin.password_hash, password):
            return {
                "role": "admin",
                "admin": _public_admin(admin),
            }

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


def request_password_reset(payload: ForgotPasswordRequest) -> Dict[str, Any]:
    db = read_db()
    lookup = _find_account_by_email(db, payload.email)
    if not lookup:
        return {"status": "ok"}

    role, subject = lookup
    now = _now()
    reset = PasswordReset(
        id=uuid.uuid4(),
        subject_id=subject.id,
        subject_type=role,
        email=subject.email,
        token=uuid.uuid4().hex,
        expires_at=now + timedelta(minutes=config.PASSWORD_RESET_EXPIRY_MINUTES),
    )

    existing = [item for item in db.get("password_resets", []) if item.get("subject_id") != str(subject.id)]
    try:
        emailer.send_password_reset(reset)
    except emailer.EmailDispatchError as exc:  # pragma: no cover - network failure
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send password reset email") from exc

    existing.append(reset.model_dump(mode="json"))
    db["password_resets"] = existing
    write_db(db)
    return {"status": "ok"}


def reset_password(payload: ResetPasswordRequest) -> Dict[str, Any]:
    db = read_db()
    records = db.get("password_resets", [])
    record_idx = next((idx for idx, raw in enumerate(records) if raw.get("token") == payload.token), None)
    if record_idx is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    record = PasswordReset.model_validate(records[record_idx])
    if record.consumed or ensure_ist(record.expires_at) < _now():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    new_hash = _hash_password(payload.new_password)
    now = _now()

    if record.subject_type == AuthRole.human:
        user_idx, user = _resolve_user(db, record.subject_id)
        user.password_hash = new_hash
        user.updated_at = now
        db["users"][user_idx] = user.model_dump(mode="json")
    else:
        admin_idx, admin = _resolve_admin(db, record.subject_id)
        admin.password_hash = new_hash
        admin.updated_at = now
        db["admins"][admin_idx] = admin.model_dump(mode="json")

    record.consumed = True
    records[record_idx] = record.model_dump(mode="json")
    db["password_resets"] = records
    write_db(db)
    return {"status": "ok"}


def update_token_status(token_id: uuid.UUID, status_update: MiniaturizationStatus) -> MiniaturizationToken:
    db = read_db()
    tokens = db.get("miniaturization_tokens", [])
    for idx, raw in enumerate(tokens):
        if raw["id"] == str(token_id):
            token = MiniaturizationToken.model_validate(raw)
            now = _now()
            token.status = status_update
            token.updated_at = now
            request_idx = next(
                (r_idx for r_idx, payload in enumerate(db.get("miniaturization_requests", [])) if payload["id"] == str(token.request_id)),
                None,
            )
            if request_idx is None:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Linked request missing")
            request = MiniaturizationRequest.model_validate(db["miniaturization_requests"][request_idx])

            user_idx, user = _resolve_user(db, token.user_id)

            if status_update == MiniaturizationStatus.approved:
                token.approved_at = now
                request.status = MiniaturizationStatus.approved
                request.approved_at = now
                user.current_stage = MiniaturizationStage.awaiting_procedure
            elif status_update == MiniaturizationStatus.rejected:
                request.status = MiniaturizationStatus.rejected
                user.current_stage = MiniaturizationStage.request_submitted
            elif status_update == MiniaturizationStatus.completed:
                token.completed_at = now
                request.status = MiniaturizationStatus.completed
                request.completed_at = now
                user.current_stage = MiniaturizationStage.miniaturized

            user.updated_at = now
            db["users"][user_idx] = user.model_dump(mode="json")
            db["miniaturization_requests"][request_idx] = request.model_dump(mode="json")
            tokens[idx] = token.model_dump(mode="json")
            db["miniaturization_tokens"] = tokens
            write_db(db)
            if status_update == MiniaturizationStatus.completed:
                _auto_activate_initial_insurance(user.id, request.id)
            return token
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")


def get_organism_state() -> OrganismState:
    db = read_db()
    snapshot = _ensure_auto_sleep_state(db)
    state = _persist_organism_state(db, snapshot)
    write_db(db)
    return state


def get_organism_telemetry(limit: int = TELEMETRY_LIMIT) -> Dict[str, Any]:
    db = read_db()
    snapshot = _ensure_auto_sleep_state(db)
    state = _persist_organism_state(db, snapshot)

    clamped_limit = max(1, min(limit, TELEMETRY_LIMIT))
    raw_entries = db.get("organism_telemetry", [])[-clamped_limit:]
    entries: List[Dict[str, Any]] = []
    for item in raw_entries:
        try:
            record = OrganismTelemetryEntry.model_validate(item)
        except Exception:
            continue
        entries.append(record.model_dump(mode="json"))

    write_db(db)
    return {
        "entries": entries,
        "organism_state": state.model_dump(mode="json"),
    }


def feed_organism(payload: FeedRequest) -> OrganismState:
    db = read_db()
    state = _ensure_auto_sleep_state(db)

    intensity = payload.profile.sensory_intensity
    volume = payload.profile.data_volume
    emotion = payload.profile.emotional_tone
    motion = payload.profile.ambient_motion

    hunger_delta = min(10.0, volume * (1 + intensity))
    state.hunger = max(0.0, state.hunger - hunger_delta)

    state.metabolism = min(100.0, state.metabolism + intensity * 5 + motion * 3)

    state.last_feed = _now()
    sleep_cycles = [SleepCycleRecord.model_validate(item) for item in db.get("sleep_cycles", [])]
    sleep_snapshot = _aggregate_sleep_metrics(sleep_cycles, state.last_sleep)
    state.mood = _resolve_mood(state, sleep_snapshot)

    state = _persist_organism_state(db, state)
    write_db(db)
    return state


def list_support_sessions_for_user(user_id: uuid.UUID) -> List[SupportSession]:
    db = read_db()
    _resolve_user(db, user_id)
    sessions = _load_support_sessions(db)
    return [session for session in sessions if session.user_id == user_id]


def list_support_sessions_for_admin() -> List[SupportSession]:
    return _load_support_sessions(read_db())


def create_support_session(user_id: uuid.UUID, payload: SupportSessionCreate) -> SupportSession:
    db = read_db()
    _, user = _resolve_user(db, user_id)
    sessions = _load_support_sessions(db)

    subject = payload.subject.strip()
    if not subject:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject is required")

    body = payload.message.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is required")

    session = SupportSession(
        id=uuid.uuid4(),
        user_id=user_id,
        subject=subject,
        distress=payload.distress,
    )
    message = SupportMessage(
        session_id=session.id,
        sender_role=AuthRole.human,
        sender_id=user_id,
        sender_name=user.name,
        body=body,
    )
    session.messages.append(message)
    session.created_at = message.created_at
    session.updated_at = message.created_at
    sessions.append(session)

    _persist_support_sessions(db, sessions)
    write_db(db)
    return session


def add_user_support_message(user_id: uuid.UUID, session_id: uuid.UUID, payload: SupportMessageInput) -> SupportSession:
    db = read_db()
    _, user = _resolve_user(db, user_id)
    sessions = _load_support_sessions(db)
    idx, session = _find_support_session(sessions, session_id)

    if session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session")
    if session.status == SupportSessionStatus.resolved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session already resolved")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required")

    message = SupportMessage(
        session_id=session.id,
        sender_role=AuthRole.human,
        sender_id=user_id,
        sender_name=user.name,
        body=body,
    )
    session.messages.append(message)
    session.updated_at = message.created_at
    sessions[idx] = session

    _persist_support_sessions(db, sessions)
    write_db(db)
    return session


def add_admin_support_message(session_id: uuid.UUID, payload: SupportAdminMessageInput) -> SupportSession:
    db = read_db()
    _, admin = _resolve_admin(db, payload.admin_id)
    sessions = _load_support_sessions(db)
    idx, session = _find_support_session(sessions, session_id)

    if session.status == SupportSessionStatus.resolved:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session already resolved")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required")

    message = SupportMessage(
        session_id=session.id,
        sender_role=AuthRole.admin,
        sender_id=admin.id,
        sender_name=admin.name,
        body=body,
    )
    session.messages.append(message)
    if session.status == SupportSessionStatus.open:
        session.status = SupportSessionStatus.assigned
    session.assigned_admin_id = admin.id
    session.assigned_admin_name = admin.name
    session.updated_at = message.created_at
    sessions[idx] = session

    _persist_support_sessions(db, sessions)
    write_db(db)
    return session


def update_support_session_from_admin(session_id: uuid.UUID, payload: SupportSessionAdminUpdate) -> SupportSession:
    db = read_db()
    _, acting_admin = _resolve_admin(db, payload.admin_id)
    sessions = _load_support_sessions(db)
    idx, session = _find_support_session(sessions, session_id)

    now = _now()
    if payload.status is not None:
        session.status = payload.status
        if payload.status == SupportSessionStatus.resolved:
            session.closed_at = now
        else:
            session.closed_at = None

    assigned_admin = acting_admin
    if payload.assigned_admin_id is not None:
        _, assigned_admin = _resolve_admin(db, payload.assigned_admin_id)
    if payload.assigned_admin_id is not None or session.status == SupportSessionStatus.assigned:
        session.assigned_admin_id = assigned_admin.id
        session.assigned_admin_name = assigned_admin.name
    if session.status == SupportSessionStatus.open and payload.assigned_admin_id is None:
        session.assigned_admin_id = None
        session.assigned_admin_name = None

    session.updated_at = now
    sessions[idx] = session
    _persist_support_sessions(db, sessions)
    write_db(db)
    return session


def close_support_session_by_user(user_id: uuid.UUID, session_id: uuid.UUID) -> SupportSession:
    db = read_db()
    _resolve_user(db, user_id)
    sessions = _load_support_sessions(db)
    idx, session = _find_support_session(sessions, session_id)

    if session.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session")

    if session.status == SupportSessionStatus.resolved:
        return session

    session.status = SupportSessionStatus.resolved
    session.closed_at = _now()
    session.updated_at = session.closed_at
    sessions[idx] = session
    _persist_support_sessions(db, sessions)
    write_db(db)
    return session