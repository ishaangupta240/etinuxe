from __future__ import annotations

import enum
import uuid
from datetime import datetime, timedelta
from typing import Annotated, Dict, List, Optional, Literal

from pydantic import BaseModel, EmailStr, Field

from .timeutils import now_ist


PositiveFloat = Annotated[float, Field(gt=0)]
UnitIntervalFloat = Annotated[float, Field(ge=0, le=1)]
SignedUnitFloat = Annotated[float, Field(ge=-1, le=1)]


class BodyProfile(BaseModel):
    height_cm: PositiveFloat
    weight_kg: Optional[PositiveFloat] = None
    blood_type: Optional[str] = None
    allergies: Optional[List[str]] = None
    notes: Optional[str] = None


class UserStatus(str, enum.Enum):
    pending_verification = "pending_verification"
    verified = "verified"


class MiniaturizationStatus(str, enum.Enum):
    draft = "draft"
    awaiting_approval = "awaiting_approval"
    approved = "approved"
    rejected = "rejected"
    completed = "completed"


class MiniaturizationStage(str, enum.Enum):
    signup = "signup"
    verified = "verified"
    request_submitted = "request_submitted"
    payment_captured = "payment_captured"
    assessment_complete = "assessment_complete"
    awaiting_procedure = "awaiting_procedure"
    miniaturized = "miniaturized"


class HealthBucket(str, enum.Enum):
    extremely_unhealthy = "extremely_unhealthy"
    unhealthy = "unhealthy"
    normal = "normal"
    good = "good"


class InsuranceTier(str, enum.Enum):
    basic = "basic"
    plus = "plus"
    premium = "premium"
    ultra = "ultra"


class User(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str
    location: Optional[str] = None
    body_profile: Optional[BodyProfile] = None
    status: UserStatus = UserStatus.pending_verification
    current_stage: MiniaturizationStage = MiniaturizationStage.signup
    otp_id: Optional[str] = None
    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)
    password_hash: str = Field(default="")
    respiration_rate: PositiveFloat = Field(default=12.0)
    energy_consumption: PositiveFloat = Field(default=1.0)
    medical_history: Optional[str] = None
    health_score: int = Field(default=60, ge=0, le=100)
    health_bucket: HealthBucket = Field(default=HealthBucket.normal)
    initial_insurance_tier: InsuranceTier = InsuranceTier.basic
    initial_insurance_activated: bool = False


class HealthSurvey(BaseModel):
    sleep_hours: Annotated[float, Field(ge=0.0, le=12.0)]
    exercise_minutes_per_week: Annotated[int, Field(ge=0, le=840)]
    diet_quality: Annotated[int, Field(ge=1, le=5)]
    stress_level: Annotated[int, Field(ge=1, le=5)]
    chronic_condition: bool = False
    alcohol_units_per_week: Annotated[int, Field(ge=0, le=40)] = 0
    smoker: bool = False
    meditation_minutes_per_week: Annotated[int, Field(ge=0, le=840)] = 0
    hydration_liters_per_day: Annotated[float, Field(ge=0.0, le=6.0)] = 2.0


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    location: Optional[str] = None
    password: str = Field(min_length=8)
    body_profile: Optional[BodyProfile] = None
    respiration_rate: Optional[PositiveFloat] = None
    energy_consumption: Optional[PositiveFloat] = None
    medical_history: Optional[str] = None
    health_survey: Optional[HealthSurvey] = None
    initial_insurance_tier: InsuranceTier = InsuranceTier.basic


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    location: Optional[str] = None
    status: Optional[UserStatus] = None
    current_stage: Optional[MiniaturizationStage] = None
    health_score: Optional[int] = Field(default=None, ge=0, le=100)
    health_bucket: Optional[HealthBucket] = None
    respiration_rate: Optional[PositiveFloat] = None
    energy_consumption: Optional[PositiveFloat] = None
    medical_history: Optional[str] = None


class HealthProfileUpdate(BaseModel):
    body_profile: BodyProfile
    respiration_rate: PositiveFloat
    energy_consumption: PositiveFloat
    medical_history: Optional[str] = None
    health_survey: HealthSurvey


class AdminAccount(BaseModel):
    id: uuid.UUID
    email: EmailStr
    name: str
    password_hash: str
    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)


class AdminAccountCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)


class AuthRole(str, enum.Enum):
    human = "human"
    admin = "admin"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class OTPRecord(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    user_id: uuid.UUID
    code: str
    expires_at: datetime
    consumed: bool = False


class OTPVerification(BaseModel):
    user_id: uuid.UUID
    otp_code: str


class PasswordReset(BaseModel):
    id: uuid.UUID
    subject_id: uuid.UUID
    subject_type: AuthRole
    email: EmailStr
    token: str
    expires_at: datetime
    consumed: bool = False


class MiniaturizationRequestInput(BaseModel):
    scale: UnitIntervalFloat
    safety_answers: Dict[str, str]


class MiniaturizationRequest(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    scale: float
    safety_answers: Dict[str, str]
    cost_usd: float
    status: MiniaturizationStatus = MiniaturizationStatus.awaiting_approval
    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)
    approved_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    staff_health_rating: Optional[int] = Field(default=None, ge=0, le=100)
    staff_health_rating_at: Optional[datetime] = None


class PersonalityAssessment(BaseModel):
    user_id: uuid.UUID
    emotional_profile: Dict[str, float]
    narrative: Optional[str] = None
    sensitivity_threshold: Optional[UnitIntervalFloat] = None
    toxicity_resistance: Optional[UnitIntervalFloat] = None
    dream_tolerance: Optional[UnitIntervalFloat] = None


class DNAToken(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    payload_checksum: str
    encrypted_blob: str
    created_at: datetime = Field(default_factory=now_ist)
    remaining_energy: float = Field(default=5.0, ge=0)


class DNAProfile(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    respiration_rate: PositiveFloat
    energy_consumption: PositiveFloat
    medical_history: Optional[str] = None
    health_score: int = Field(ge=0, le=100)
    health_bucket: HealthBucket
    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)
    health_summary: Optional[str] = None
    health_risks: List[str] = Field(default_factory=list)
    health_inputs: Optional[HealthSurvey] = None


class MiniaturizationToken(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    request_id: uuid.UUID
    dna_token_id: uuid.UUID
    status: MiniaturizationStatus = MiniaturizationStatus.awaiting_approval
    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)
    approved_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class PaymentRecord(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    request_id: uuid.UUID
    amount_usd: float
    currency: str = "USD"
    status: str = "captured"
    created_at: datetime = Field(default_factory=now_ist)
    paid_at: datetime = Field(default_factory=now_ist)


class PaymentInput(BaseModel):
    request_id: uuid.UUID
    amount_usd: PositiveFloat


class InsurancePolicy(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: uuid.UUID
    request_id: uuid.UUID
    tier: InsuranceTier
    scale: PositiveFloat
    steps: int = Field(ge=1)
    base_rate_per_step: PositiveFloat
    health_bucket: HealthBucket
    bucket_multiplier: PositiveFloat
    points_redeemed: float = 0.0
    points_value_usd: float = 0.0
    monthly_premium: PositiveFloat
    final_premium: float = Field(ge=0.0)
    status: Literal["active", "cancelled", "scheduled"] = "active"
    created_at: datetime = Field(default_factory=now_ist)
    next_billing_at: datetime = Field(default_factory=lambda: now_ist() + timedelta(days=30))
    last_billed_at: Optional[datetime] = None
    effective_at: datetime = Field(default_factory=now_ist)


class InsurancePolicyCreate(BaseModel):
    user_id: uuid.UUID
    request_id: uuid.UUID
    tier: InsuranceTier


class TokenIssueInput(BaseModel):
    request_id: uuid.UUID
    dna_token_id: uuid.UUID


class TokenStatusUpdate(BaseModel):
    status: MiniaturizationStatus


class StaffHealthRatingUpdate(BaseModel):
    rating: int = Field(ge=0, le=100)


class OrganismMood(str, enum.Enum):
    neutral = "neutral"
    happy = "happy"
    excited = "excited"
    relaxed = "relaxed"
    sad = "sad"
    angry = "angry"
    depressed = "depressed"
    calm = "calm"
    agitated = "agitated"
    distressed = "distressed"


class OrganismState(BaseModel):
    hunger: float = Field(ge=0)
    metabolism: float = Field(ge=0)
    mood: OrganismMood = OrganismMood.neutral
    last_feed: Optional[datetime] = None
    dream_energy: float = Field(default=5.0, ge=0)
    dream_debt: float = Field(default=0.0, ge=0)
    toxicity_level: float = Field(default=0.0, ge=0)
    sleep_phase: str = "awake"
    last_sleep: Optional[datetime] = None
    sensitivity_threshold: UnitIntervalFloat = Field(default=0.5)
    toxicity_resistance: UnitIntervalFloat = Field(default=0.5)
    dream_tolerance: UnitIntervalFloat = Field(default=0.5)
    auto_sleep_enabled: bool = True
    sleep_schedule_hour: int = Field(default=23, ge=0, le=23)
    wake_schedule_hour: int = Field(default=6, ge=0, le=23)
    sleep_duration_hours: float = Field(default=7.0, gt=0)
    sleep_session_started_at: Optional[datetime] = None
    sleep_session_ends_at: Optional[datetime] = None


class OrganismTelemetryEntry(BaseModel):
    timestamp: datetime = Field(default_factory=now_ist)
    hunger: float
    metabolism: float
    dream_energy: float
    toxicity_level: float
    sleep_hours: float
    sleep_phase: str
    dream_debt: float


class FeedProfile(BaseModel):
    sensory_intensity: UnitIntervalFloat
    emotional_tone: SignedUnitFloat
    ambient_motion: UnitIntervalFloat
    data_volume: PositiveFloat


class FeedRequest(BaseModel):
    token_ids: Optional[List[uuid.UUID]] = None
    profile: FeedProfile


class InsurancePricing(BaseModel):
    basic: PositiveFloat = 20.0
    plus: PositiveFloat = 30.0
    premium: PositiveFloat = 60.0
    ultra: PositiveFloat = 80.0


class HealthBucketMultipliers(BaseModel):
    good: PositiveFloat = 1.0
    normal: PositiveFloat = 1.2
    unhealthy: PositiveFloat = 1.7
    extremely_unhealthy: PositiveFloat = 2.4


class PointsDiscountPolicy(BaseModel):
    points_per_discount_unit: int = Field(default=10000, ge=1)
    discount_per_unit: PositiveFloat = 30.0


class AdminSettings(BaseModel):
    pricing_per_step: float = 100.0
    scale_min: float = 0.001
    scale_max: float = 0.5
    scale_step: float = 0.01
    insurance_pricing: InsurancePricing = Field(default_factory=InsurancePricing)
    health_bucket_multipliers: HealthBucketMultipliers = Field(default_factory=HealthBucketMultipliers)
    points_discount: PointsDiscountPolicy = Field(default_factory=PointsDiscountPolicy)


class SettingsUpdate(BaseModel):
    pricing_per_step: Optional[float] = None
    scale_min: Optional[float] = None
    scale_max: Optional[float] = None
    scale_step: Optional[float] = None
    insurance_pricing: Optional[InsurancePricing] = None
    health_bucket_multipliers: Optional[HealthBucketMultipliers] = None
    points_discount: Optional[PointsDiscountPolicy] = None


class SupportSessionStatus(str, enum.Enum):
    open = "open"
    assigned = "assigned"
    resolved = "resolved"


class SupportMessage(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    session_id: uuid.UUID
    sender_role: AuthRole
    sender_id: Optional[uuid.UUID] = None
    sender_name: str
    body: str = Field(min_length=1, max_length=2000)
    created_at: datetime = Field(default_factory=now_ist)


class SupportSession(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    subject: str
    distress: bool = False
    status: SupportSessionStatus = SupportSessionStatus.open
    created_at: datetime = Field(default_factory=now_ist)
    updated_at: datetime = Field(default_factory=now_ist)
    closed_at: Optional[datetime] = None
    assigned_admin_id: Optional[uuid.UUID] = None
    assigned_admin_name: Optional[str] = None
    messages: List[SupportMessage] = Field(default_factory=list)


class SupportSessionCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=140)
    message: str = Field(min_length=1, max_length=2000)
    distress: bool = False


class SupportMessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class SupportAdminMessageInput(SupportMessageInput):
    admin_id: uuid.UUID


class SupportSessionAdminUpdate(BaseModel):
    admin_id: uuid.UUID
    status: Optional[SupportSessionStatus] = None
    assigned_admin_id: Optional[uuid.UUID] = None


class MemoryLogInput(BaseModel):
    timestamp: datetime = Field(default_factory=now_ist)
    valence: SignedUnitFloat
    strength: UnitIntervalFloat
    toxicity: UnitIntervalFloat
    embedding: List[float] = Field(min_items=2)
    memory_text: str = Field(min_length=1, max_length=2000)


class MemoryNeighbor(BaseModel):
    id: uuid.UUID
    weight: UnitIntervalFloat


class MemoryLog(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    timestamp: datetime
    valence: SignedUnitFloat
    strength: UnitIntervalFloat
    toxicity: UnitIntervalFloat
    embedding: List[float]
    memory_text: str
    tokens_awarded: float


class MemoryNode(BaseModel):
    id: uuid.UUID
    log_id: uuid.UUID
    valence: SignedUnitFloat
    strength: UnitIntervalFloat
    toxicity: UnitIntervalFloat
    energy_reserve: float
    neighbors: List[MemoryNeighbor] = Field(default_factory=list)


class MemoryToken(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    log_id: uuid.UUID
    amount: float
    created_at: datetime = Field(default_factory=now_ist)
    spent: bool = False
    spent_at: Optional[datetime] = None


class MemoryTokenStatusUpdate(BaseModel):
    spent: bool


class DreamGlyph(BaseModel):
    glyph_id: str
    intensity: UnitIntervalFloat
    motion: str
    color: str
    seed_nodes: List[uuid.UUID]


class DreamRecord(BaseModel):
    id: uuid.UUID
    timestamp: datetime = Field(default_factory=now_ist)
    seed_node_ids: List[uuid.UUID]
    glyphs: List[DreamGlyph]
    intensity: UnitIntervalFloat
    effects: List[str]
    energy_used: float
    category: str
    outcome: Literal["success", "failure"] = "success"
    memory_tokens_consumed: int = 0
    dna_energy_used: float = 0.0
    state_energy_used: float = 0.0


class DreamGenerationRequest(BaseModel):
    max_energy: Optional[float] = Field(default=None, gt=0)
    force: bool = False
    preferred_category: Optional[str] = None


class SleepCycleRequest(BaseModel):
    duration_hours: float = Field(default=6.0, gt=0)
    quality: UnitIntervalFloat = Field(default=0.6)
    abrupt_wake: bool = False


class SleepCycleRecord(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    duration_hours: float
    quality: float
    abrupt_wake: bool
    occurred_at: datetime = Field(default_factory=now_ist)
