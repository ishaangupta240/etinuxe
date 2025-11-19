function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE;
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  if (typeof window === "undefined") {
    return "/api";
  }

  const { protocol, hostname } = window.location;
  if (protocol === "file:") {
    return "http://127.0.0.1:8000";
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const baseProtocol = protocol === "http:" || protocol === "https:" ? protocol : "http:";
    const origin = `${baseProtocol}//${hostname}:8000`;
    return origin;
  }

  return "/api";
}

const API_BASE = resolveApiBase();

export type MiniaturizationStatus = "draft" | "awaiting_approval" | "approved" | "rejected" | "completed";
export type MiniaturizationStage =
  | "signup"
  | "verified"
  | "request_submitted"
  | "payment_captured"
  | "assessment_complete"
  | "awaiting_procedure"
  | "miniaturized";

export interface BodyProfile {
  height_cm: number;
  weight_kg?: number;
  blood_type?: string;
  allergies?: string[];
  notes?: string;
}

export interface HealthSurveyRecord {
  sleep_hours: number;
  exercise_minutes_per_week: number;
  diet_quality: number;
  stress_level: number;
  chronic_condition: boolean;
  alcohol_units_per_week: number;
  smoker: boolean;
  meditation_minutes_per_week: number;
  hydration_liters_per_day: number;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  location?: string;
  body_profile?: BodyProfile | null;
  status: "pending_verification" | "verified";
  current_stage: MiniaturizationStage;
  created_at: string;
  updated_at: string;
  respiration_rate: number;
  energy_consumption: number;
  medical_history?: string | null;
  health_score: number;
  health_bucket: string;
}

export interface AdminAccountRecord {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface MiniaturizationRequestRecord {
  id: string;
  user_id: string;
  scale: number;
  safety_answers: Record<string, string>;
  cost_usd: number;
  status: MiniaturizationStatus;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  completed_at?: string | null;
  staff_health_rating?: number | null;
  staff_health_rating_at?: string | null;
}

export interface PaymentRecord {
  id: string;
  user_id: string;
  request_id: string;
  amount_usd: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string;
}

export interface DNATokenRecord {
  id: string;
  user_id: string;
  payload_checksum: string;
  encrypted_blob: string;
  created_at: string;
  remaining_energy: number;
}

export interface DNAProfileRecord {
  id: string;
  user_id: string;
  respiration_rate: number;
  energy_consumption: number;
  medical_history?: string | null;
  health_score: number;
  health_bucket: string;
  created_at: string;
  updated_at: string;
  health_summary?: string | null;
  health_risks?: string[];
  health_inputs?: HealthSurveyRecord | null;
}

export interface MiniaturizationTokenRecord {
  id: string;
  user_id: string;
  request_id: string;
  dna_token_id: string;
  status: MiniaturizationStatus;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  completed_at?: string | null;
}

export interface PersonalityAssessmentRecord {
  user_id: string;
  emotional_profile: Record<string, number>;
  narrative?: string;
}

export interface HealthProfileRecord {
  health_score: number;
  health_bucket: string;
  bucket_label: string;
  medical_history?: string | null;
  respiration_rate: number;
  energy_consumption: number;
  profile_id?: string | null;
  updated_at?: string | null;
  health_summary?: string | null;
  health_risks: string[];
  health_inputs?: HealthSurveyRecord | null;
}

export type InsuranceTier = "basic" | "plus" | "premium" | "ultra";

export interface InsurancePricingRecord {
  basic: number;
  plus: number;
  premium: number;
  ultra: number;
}

export interface HealthBucketMultipliersRecord {
  good: number;
  normal: number;
  unhealthy: number;
  extremely_unhealthy: number;
}

export interface PointsDiscountPolicyRecord {
  points_per_discount_unit: number;
  discount_per_unit: number;
}

export interface InsurancePolicyRecord {
  id: string;
  user_id: string;
  request_id: string;
  tier: InsuranceTier;
  scale: number;
  steps: number;
  base_rate_per_step: number;
  health_bucket: string;
  bucket_multiplier: number;
  points_redeemed: number;
  points_value_usd: number;
  monthly_premium: number;
  final_premium: number;
  status: "active" | "cancelled" | "scheduled";
  created_at: string;
  next_billing_at: string;
  last_billed_at?: string | null;
  effective_at: string;
}

export interface InsurancePolicyQuote {
  tier: InsuranceTier;
  steps: number;
  base_rate_per_step: number;
  bucket_multiplier: number;
  monthly_premium: number;
  final_premium: number;
  points_redeemed: number;
  discount_value_usd: number;
  points_available: number;
}

export interface UserOverview {
  user: UserRecord;
  requests: MiniaturizationRequestRecord[];
  payments: PaymentRecord[];
  dna_tokens: DNATokenRecord[];
  dna_profile?: DNAProfileRecord | null;
  miniaturization_tokens: MiniaturizationTokenRecord[];
  assessments: PersonalityAssessmentRecord[];
  memory_logs: MemoryLogRecord[];
  memory_tokens: MemoryTokenRecord[];
  memory_summary: MemorySummaryRecord;
  health_profile: HealthProfileRecord;
  insurance_policies: InsurancePolicyRecord[];
}

export interface OrganismState {
  hunger: number;
  metabolism: number;
  mood: string;
  last_feed: string | null;
  dream_energy: number;
  dream_debt: number;
  toxicity_level: number;
  sleep_phase: string;
  last_sleep: string | null;
  sensitivity_threshold: number;
  toxicity_resistance: number;
  dream_tolerance: number;
  auto_sleep_enabled: boolean;
  sleep_schedule_hour: number;
  wake_schedule_hour: number;
  sleep_duration_hours: number;
  sleep_session_started_at: string | null;
  sleep_session_ends_at: string | null;
}

export interface AdminOverviewSummary {
  total_users: number;
  total_requests: number;
  total_payments: number;
  total_revenue: number;
  pending_tokens: number;
  approved_tokens: number;
  memory_logs: number;
  memory_tokens: number;
  dreams: number;
  dream_energy: number;
  dna_energy: number;
  sleep_cycles: number;
  avg_sleep_quality: number;
  memory_points_total: number;
  memory_points_available: number;
  memory_points_spent: number;
  avg_respiration_rate: number;
  avg_energy_consumption: number;
  avg_health_score: number;
  health_bucket_distribution: Record<string, number>;
  insurance_policies: number;
  insurance_recurring_revenue: number;
}

export interface MemoryLogRecord {
  id: string;
  user_id: string;
  timestamp: string;
  valence: number;
  strength: number;
  toxicity: number;
  embedding: number[];
  memory_text: string;
  tokens_awarded: number;
}

export interface MemoryTokenRecord {
  id: string;
  user_id: string;
  log_id: string;
  amount: number;
  created_at: string;
  spent: boolean;
  spent_at?: string | null;
}

export interface MemorySummaryRecord {
  total_points: number;
  available_points: number;
  spent_points: number;
  logs_recorded: number;
  tokens_issued: number;
}

export interface DreamGlyphRecord {
  glyph_id: string;
  intensity: number;
  motion: string;
  color: string;
  seed_nodes: string[];
}

export interface DreamRecordEntry {
  id: string;
  timestamp: string;
  seed_node_ids: string[];
  glyphs: DreamGlyphRecord[];
  intensity: number;
  effects: string[];
  energy_used: number;
  category: string;
  outcome: "success" | "failure";
  memory_tokens_consumed: number;
  dna_energy_used: number;
  state_energy_used: number;
}

export interface SleepCycleRecordEntry {
  id: string;
  duration_hours: number;
  quality: number;
  abrupt_wake: boolean;
  occurred_at: string;
}

export interface AdminOverview {
  users: UserRecord[];
  requests: MiniaturizationRequestRecord[];
  payments: PaymentRecord[];
  miniaturization_tokens: MiniaturizationTokenRecord[];
  dna_tokens: DNATokenRecord[];
  dna_profiles: DNAProfileRecord[];
  memory_logs: MemoryLogRecord[];
  memory_tokens: MemoryTokenRecord[];
  dreams: DreamRecordEntry[];
  sleep_cycles: SleepCycleRecordEntry[];
  insurance_policies: InsurancePolicyRecord[];
  summary: AdminOverviewSummary;
  settings: SettingsRecord;
  organism_state: OrganismState;
}

export interface SettingsRecord {
  pricing_per_step: number;
  scale_min: number;
  scale_max: number;
  scale_step: number;
  insurance_pricing: InsurancePricingRecord;
  health_bucket_multipliers: HealthBucketMultipliersRecord;
  points_discount: PointsDiscountPolicyRecord;
}

export type SupportSessionStatus = "open" | "assigned" | "resolved";

export interface SupportMessageRecord {
  id: string;
  session_id: string;
  sender_role: "human" | "admin";
  sender_id?: string | null;
  sender_name: string;
  body: string;
  created_at: string;
}

export interface SupportSessionRecord {
  id: string;
  user_id: string;
  subject: string;
  distress: boolean;
  status: SupportSessionStatus;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  assigned_admin_id?: string | null;
  assigned_admin_name?: string | null;
  messages: SupportMessageRecord[];
}

export interface SupportSessionCreatePayload {
  subject: string;
  message: string;
  distress: boolean;
}

export interface SupportMessagePayload {
  body: string;
}

export interface SupportAdminMessagePayload extends SupportMessagePayload {
  admin_id: string;
}

export interface SupportSessionAdminUpdatePayload {
  admin_id: string;
  status?: SupportSessionStatus;
  assigned_admin_id?: string;
}

type RequestOptions = Omit<RequestInit, "headers" | "body"> & {
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const raw = await response.text();
    let detail: string | undefined;
    if (raw) {
      try {
        const payload = JSON.parse(raw) as { detail?: unknown };
        detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
      } catch (error) {
        detail = raw;
      }
    }
    throw new Error(detail || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export interface SignupPayload {
  email: string;
  name: string;
  password: string;
  location?: string;
  initial_insurance_tier?: InsuranceTier;
}

export interface SignupResponse {
  user_id: string;
  message: string;
}

export interface HealthProfilePayload {
  body_profile: BodyProfile;
  respiration_rate: number;
  energy_consumption: number;
  medical_history?: string;
  health_survey: HealthSurveyRecord;
}

export interface HealthProfileResponse {
  user_id: string;
  health_score: number;
  health_bucket: string;
  profile_id: string;
  updated_at: string;
  health_summary?: string | null;
  health_risks: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AdminAccountSummary {
  id: string;
  email: string;
  name: string;
}

export type LoginResponse =
  | {
      role: "human";
      user: UserRecord;
      otp?: {
        status: string;
        expires_at: string;
      };
    }
  | {
      role: "admin";
      admin: AdminAccountSummary;
    };

export interface ForgotPasswordPayload {
  email: string;
}

export interface ForgotPasswordResponse {
  status: string;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  status: string;
}

export interface MemoryLogPayload {
  valence: number;
  strength: number;
  toxicity: number;
  embedding: number[];
  memory_text: string;
  timestamp?: string;
}

export async function signupHuman(payload: SignupPayload): Promise<SignupResponse> {
  return request<SignupResponse>("/users/signup", { method: "POST", body: payload });
}

export async function submitHealthProfile(
  userId: string,
  payload: HealthProfilePayload
): Promise<HealthProfileResponse> {
  return request<HealthProfileResponse>(`/users/${userId}/health-profile`, { method: "POST", body: payload });
}

export interface ResendOtpResponse {
  status: string;
  expires_at: string;
}

export async function resendSignupOtp(userId: string): Promise<ResendOtpResponse> {
  return request<ResendOtpResponse>(`/users/${userId}/otp/resend`, { method: "POST" });
}

export async function loginAccount(payload: LoginPayload): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", { method: "POST", body: payload });
}

export async function requestPasswordReset(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
  return request<ForgotPasswordResponse>("/auth/forgot-password", { method: "POST", body: payload });
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<ResetPasswordResponse> {
  return request<ResetPasswordResponse>("/auth/reset-password", {
    method: "POST",
    body: {
      token: payload.token,
      new_password: payload.newPassword,
    },
  });
}

export interface VerifyPayload {
  user_id: string;
  otp_code: string;
}

export interface VerifyResponse {
  user_id: string;
  status: string;
  stage: MiniaturizationStage;
}

export async function verifyHuman(payload: VerifyPayload): Promise<VerifyResponse> {
  return request<VerifyResponse>("/users/verify", { method: "POST", body: payload });
}

export interface MiniaturizationRequestPayload {
  scale: number;
  safety_answers: Record<string, string>;
}

export interface MiniaturizationRequestResponse {
  request_id: string;
  status: MiniaturizationStatus;
  cost_usd: number;
}

export async function submitMiniaturizationRequest(
  userId: string,
  payload: MiniaturizationRequestPayload
): Promise<MiniaturizationRequestResponse> {
  return request<MiniaturizationRequestResponse>(`/users/${userId}/miniaturization`, { method: "POST", body: payload });
}

export interface PaymentPayload {
  request_id: string;
  amount_usd: number;
}

export interface PaymentResponse {
  payment_id: string;
  status: string;
}

export async function recordPayment(userId: string, payload: PaymentPayload): Promise<PaymentResponse> {
  return request<PaymentResponse>(`/users/${userId}/payment`, { method: "POST", body: payload });
}

export interface AssessmentPayload {
  user_id: string;
  emotional_profile: Record<string, number>;
  narrative?: string;
}

export interface AssessmentResponse {
  dna_token_id: string;
  checksum: string;
}

export async function recordAssessment(userId: string, payload: AssessmentPayload): Promise<AssessmentResponse> {
  return request<AssessmentResponse>(`/users/${userId}/personality`, { method: "POST", body: payload });
}

export interface TokenIssuePayload {
  request_id: string;
  dna_token_id: string;
}

export interface TokenIssueResponse {
  token_id: string;
  status: MiniaturizationStatus;
}

export async function issueMiniaturizationToken(
  userId: string,
  payload: TokenIssuePayload
): Promise<TokenIssueResponse> {
  return request<TokenIssueResponse>(`/users/${userId}/token`, { method: "POST", body: payload });
}

export async function fetchUserOverview(userId: string): Promise<UserOverview> {
  return request<UserOverview>(`/users/${userId}`);
}

export async function recordMemoryLog(userId: string, payload: MemoryLogPayload): Promise<{ log: MemoryLogRecord; token: MemoryTokenRecord }> {
  return request<{ log: MemoryLogRecord; token: MemoryTokenRecord }>(`/memories/${userId}`, { method: "POST", body: payload });
}

export async function fetchMemoryLogs(params: { userId?: string } = {}): Promise<{ logs: MemoryLogRecord[] }> {
  const query = params.userId ? `?user_id=${encodeURIComponent(params.userId)}` : "";
  return request<{ logs: MemoryLogRecord[] }>(`/memories${query}`);
}

export async function fetchMemoryTokens(params: { userId?: string } = {}): Promise<{ tokens: MemoryTokenRecord[] }> {
  const query = params.userId ? `?user_id=${encodeURIComponent(params.userId)}` : "";
  return request<{ tokens: MemoryTokenRecord[] }>(`/memories/tokens${query}`);
}

export async function getOrganismState(): Promise<OrganismState> {
  return request<OrganismState>("/organism/state");
}

export type FeedPayload = {
  sensory_intensity: number;
  emotional_tone: number;
  ambient_motion: number;
  data_volume: number;
};

export async function feedOrganism(payload: FeedPayload): Promise<OrganismState> {
  return request<OrganismState>("/organism/feed", { method: "POST", body: { profile: payload } });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return request<AdminOverview>("/admin/overview");
}

export async function fetchAdminRequests(): Promise<MiniaturizationRequestRecord[]> {
  const response = await request<{ requests: MiniaturizationRequestRecord[] }>("/admin/requests");
  return response.requests;
}

export type SettingsUpdatePayload = Partial<SettingsRecord>;

export async function updateSettings(payload: SettingsUpdatePayload): Promise<SettingsRecord> {
  return request<SettingsRecord>("/admin/settings", { method: "PATCH", body: payload });
}

export interface InsurancePolicyCreatePayload {
  user_id: string;
  request_id: string;
  tier: InsuranceTier;
}

export interface AdminUserUpdatePayload {
  name?: string;
  email?: string;
  location?: string | null;
  status?: UserRecord["status"];
  current_stage?: MiniaturizationStage;
  health_score?: number;
  health_bucket?: UserRecord["health_bucket"];
  respiration_rate?: number;
  energy_consumption?: number;
  medical_history?: string | null;
}

export interface AdminAccountCreatePayload {
  name: string;
  email: string;
  password: string;
}

export type InsurancePolicySelectionPayload = {
  request_id: string;
  tier: InsuranceTier;
};

export interface InsurancePolicyActivationResponse {
  policy: InsurancePolicyRecord;
  payment?: PaymentRecord | null;
  discount: { points_spent: number; value_usd: number };
  pricing: InsurancePolicyQuote;
  replaced_policy_id?: string | null;
  activation_mode?: "immediate" | "scheduled";
  effective_at?: string | null;
}

export interface InsurancePolicyQuoteResponse {
  quote: InsurancePolicyQuote;
  has_active_policy: boolean;
  eligible: boolean;
  request_status: MiniaturizationStatus;
  active_policy_tier?: InsuranceTier | null;
  activation_mode?: "immediate" | "scheduled";
  effective_at?: string | null;
  scheduled_policy_tier?: InsuranceTier | null;
}

export async function fetchInsurancePolicies(): Promise<InsurancePolicyRecord[]> {
  const response = await request<{ policies: InsurancePolicyRecord[] }>("/admin/insurance/policies");
  return response.policies;
}

export async function fetchAdminTokens(): Promise<MiniaturizationTokenRecord[]> {
  const response = await request<{ tokens: MiniaturizationTokenRecord[] }>("/admin/tokens");
  return response.tokens;
}

export async function createInsurancePolicy(payload: InsurancePolicyCreatePayload): Promise<InsurancePolicyActivationResponse> {
  return request<InsurancePolicyActivationResponse>("/admin/insurance/policies", {
    method: "POST",
    body: payload,
  });
}

export async function updateUserByAdmin(userId: string, payload: AdminUserUpdatePayload): Promise<UserRecord> {
  const response = await request<{ user: UserRecord }>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: payload,
  });
  return response.user;
}

export async function createAdminAccount(payload: AdminAccountCreatePayload): Promise<AdminAccountRecord> {
  const response = await request<{ admin: AdminAccountRecord }>("/admin/admins", {
    method: "POST",
    body: payload,
  });
  return response.admin;
}

export async function fetchUserInsurancePolicies(userId: string): Promise<InsurancePolicyRecord[]> {
  const response = await request<{ policies: InsurancePolicyRecord[] }>(`/users/${userId}/insurance`);
  return response.policies;
}

export async function previewInsurancePolicy(userId: string, payload: InsurancePolicySelectionPayload): Promise<InsurancePolicyQuoteResponse> {
  const body: InsurancePolicyCreatePayload = { user_id: userId, request_id: payload.request_id, tier: payload.tier };
  return request<InsurancePolicyQuoteResponse>(`/users/${userId}/insurance/preview`, {
    method: "POST",
    body,
  });
}

export async function activateInsurancePolicy(userId: string, payload: InsurancePolicySelectionPayload): Promise<InsurancePolicyActivationResponse> {
  const body: InsurancePolicyCreatePayload = { user_id: userId, request_id: payload.request_id, tier: payload.tier };
  return request<InsurancePolicyActivationResponse>(`/users/${userId}/insurance`, {
    method: "POST",
    body,
  });
}

export async function updateTokenStatus(tokenId: string, status: MiniaturizationStatus): Promise<{ token_id: string; status: MiniaturizationStatus }> {
  return request<{ token_id: string; status: MiniaturizationStatus }>(`/admin/tokens/${tokenId}/status`, {
    method: "POST",
    body: { status },
  });
}

export async function updateMemoryTokenStatus(tokenId: string, spent: boolean): Promise<MemoryTokenRecord> {
  const response = await request<{ token: MemoryTokenRecord }>(`/admin/memory-tokens/${tokenId}/status`, {
    method: "POST",
    body: { spent },
  });
  return response.token;
}

export interface UpdateHealthRatingResponse {
  request: MiniaturizationRequestRecord;
  user: UserRecord;
  dna_profile?: DNAProfileRecord | null;
}

export async function updateRequestHealthRating(requestId: string, rating: number): Promise<UpdateHealthRatingResponse> {
  return request<UpdateHealthRatingResponse>(`/admin/requests/${requestId}/health-rating`, {
    method: "POST",
    body: { rating },
  });
}

export async function fetchUserSupportSessions(userId: string): Promise<SupportSessionRecord[]> {
  return request<SupportSessionRecord[]>(`/support/users/${userId}/sessions`);
}

export async function createSupportSession(userId: string, payload: SupportSessionCreatePayload): Promise<SupportSessionRecord> {
  return request<SupportSessionRecord>(`/support/users/${userId}/sessions`, { method: "POST", body: payload });
}

export async function sendUserSupportMessage(
  userId: string,
  sessionId: string,
  payload: SupportMessagePayload
): Promise<SupportSessionRecord> {
  return request<SupportSessionRecord>(`/support/users/${userId}/sessions/${sessionId}/messages`, { method: "POST", body: payload });
}

export async function closeUserSupportSession(userId: string, sessionId: string): Promise<SupportSessionRecord> {
  return request<SupportSessionRecord>(`/support/users/${userId}/sessions/${sessionId}/close`, { method: "POST" });
}

export async function fetchAdminSupportSessions(): Promise<SupportSessionRecord[]> {
  return request<SupportSessionRecord[]>("/support/admin/sessions");
}

export async function sendAdminSupportMessage(
  sessionId: string,
  payload: SupportAdminMessagePayload
): Promise<SupportSessionRecord> {
  return request<SupportSessionRecord>(`/support/admin/sessions/${sessionId}/messages`, { method: "POST", body: payload });
}

export async function updateSupportSession(
  sessionId: string,
  payload: SupportSessionAdminUpdatePayload
): Promise<SupportSessionRecord> {
  return request<SupportSessionRecord>(`/support/admin/sessions/${sessionId}`, { method: "PATCH", body: payload });
}
