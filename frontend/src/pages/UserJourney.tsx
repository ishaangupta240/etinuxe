import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  AssessmentPayload,
  HealthProfilePayload,
  fetchUserOverview,
  issueMiniaturizationToken,
  recordAssessment,
  recordPayment,
  SignupPayload,
  signupHuman,
  InsuranceTier,
  submitHealthProfile,
  submitMiniaturizationRequest,
  TokenIssueResponse,
  UserOverview,
  verifyHuman,
} from "../api";

import "./Account.css";
import "./UserJourney.css";

type JourneyStep =
  | "signup"
  | "verify"
  | "intake"
  | "mini"
  | "payment"
  | "assessment"
  | "token"
  | "complete";

type SignupFormState = {
  email: string;
  name: string;
  password: string;
  location: string;
  initial_insurance_tier: InsuranceTier;
};

type HealthIntakeFormState = {
  height_cm: string;
  weight_kg: string;
  blood_type: string;
  allergies: string;
  notes: string;
  respiration_rate: string;
  energy_consumption: string;
  medical_history: string;
  sleep_hours: string;
  exercise_minutes_per_week: string;
  diet_quality: string;
  stress_level: string;
  chronic_condition: boolean;
  alcohol_units_per_week: string;
  smoker: boolean;
  meditation_minutes_per_week: string;
  hydration_liters_per_day: string;
};

type MiniFormState = {
  scale: string;
  environment: string;
  constraints: string;
};

type AssessmentFormState = {
  joy: string;
  calm: string;
  dread: string;
  narrative: string;
};

const insuranceTierOptions: InsuranceTier[] = ["basic", "plus", "premium", "ultra"];
const insuranceTierLabels: Record<InsuranceTier, string> = {
  basic: "Basic",
  plus: "Plus",
  premium: "Premium",
  ultra: "Ultra",
};

function SectionTitle({ step, title }: { step: JourneyStep; title: string }): JSX.Element {
  return (
    <header className="user-journey__section-header">
      <span className="label label--muted">Step</span>
      <h2 className="user-journey__section-title">{title}</h2>
      <span className="user-journey__section-phase">Phase: {step.toUpperCase()}</span>
    </header>
  );
}

function Timeline({ overview }: { overview: UserOverview | null }): JSX.Element {
  if (!overview) {
    return (
      <section
        className="surface-card account__panel user-journey__panel user-journey__panel--timeline"
        data-scroll-fade
      >
        <h3 className="user-journey__panel-title">Lifecycle Timeline</h3>
        <p className="text-secondary">Begin the sign-up flow to unlock timeline telemetry.</p>
      </section>
    );
  }

  const { user, requests, payments, dna_tokens, miniaturization_tokens } = overview;

  const events = [
    {
      label: "Signup",
      when: user.created_at,
      detail: `Account status: ${user.status}`,
    },
    requests[0]
      ? {
          label: "Miniaturization Request",
          when: requests[0].created_at,
          detail: `Scale ${requests[0].scale}x · Cost $${requests[0].cost_usd.toFixed(2)}`,
        }
      : null,
    payments[0]
      ? {
          label: "Payment",
          when: payments[0].created_at,
          detail: `Invoice settled: $${payments[0].amount_usd.toFixed(2)}`,
        }
      : null,
    dna_tokens[0]
      ? {
          label: "DNA Token",
          when: dna_tokens[0].created_at,
          detail: `Checksum ${dna_tokens[0].payload_checksum.slice(0, 10)}…`,
        }
      : null,
    miniaturization_tokens[0]
      ? {
          label: "Miniaturization Token",
          when: miniaturization_tokens[0].created_at,
          detail: `Status ${miniaturization_tokens[0].status}`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; when: string; detail: string }>;

  return (
    <section
      className="surface-card account__panel user-journey__panel user-journey__panel--timeline"
      data-scroll-fade
    >
      <h3 className="user-journey__panel-title">Lifecycle Timeline</h3>
      <ul className="user-journey__timeline">
        {events.map(event => (
          <li key={`${event.label}-${event.when}`} className="user-journey__timeline-item">
            <div className="user-journey__timeline-heading">{event.label}</div>
            <div className="user-journey__timeline-meta">
              {new Date(event.when).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
            </div>
            <div className="text-secondary">{event.detail}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function UserJourney(): JSX.Element {
  const [step, setStep] = useState<JourneyStep>("signup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  const [userId, setUserId] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");

  const [requestId, setRequestId] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("");

  const [dnaTokenId, setDnaTokenId] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<TokenIssueResponse | null>(null);
  const [overview, setOverview] = useState<UserOverview | null>(null);

  const log = useCallback((message: string) => {
    setStatusLog(logs => [message, ...logs.slice(0, 8)]);
  }, []);

  const refreshOverview = useCallback(async () => {
    if (!userId) {
      return;
    }
    try {
      const data = await fetchUserOverview(userId);
      setOverview(data);
    } catch (err) {
      console.error(err);
    }
  }, [userId]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview, step]);

  const [signupForm, setSignupForm] = useState<SignupFormState>({
    email: "",
    name: "",
    password: "",
    location: "",
    initial_insurance_tier: "basic",
  });
  const passwordRequirement = useMemo(() => 8, []);

  const [healthForm, setHealthForm] = useState<HealthIntakeFormState>({
    height_cm: "172",
    weight_kg: "",
    blood_type: "",
    allergies: "",
    notes: "",
    respiration_rate: "12",
    energy_consumption: "1.0",
    medical_history: "",
    sleep_hours: "7",
    exercise_minutes_per_week: "150",
    diet_quality: "4",
    stress_level: "2",
    chronic_condition: false,
    alcohol_units_per_week: "2",
    smoker: false,
    meditation_minutes_per_week: "60",
    hydration_liters_per_day: "2.4",
  });

  const [miniForm, setMiniForm] = useState<MiniFormState>({
    scale: "0.1",
    environment: "",
    constraints: "",
  });

  const [assessmentForm, setAssessmentForm] = useState<AssessmentFormState>({
    joy: "0.6",
    calm: "0.4",
    dread: "0",
    narrative: "Prepared for decoherence, maintaining anchor memories.",
  });

  const updateSignupForm = useCallback(<K extends keyof SignupFormState>(field: K, value: SignupFormState[K]) => {
    setSignupForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateHealthForm = useCallback(
    <K extends keyof HealthIntakeFormState>(field: K, value: HealthIntakeFormState[K]) => {
      setHealthForm(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  const updateMiniForm = useCallback(<K extends keyof MiniFormState>(field: K, value: MiniFormState[K]) => {
    setMiniForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateAssessmentForm = useCallback(
    <K extends keyof AssessmentFormState>(field: K, value: AssessmentFormState[K]) => {
      setAssessmentForm(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  useEffect(() => {
    if (estimatedCost) {
      setPaymentAmount(estimatedCost.toFixed(2));
    }
  }, [estimatedCost]);

  const canProceed = useMemo(() => {
    switch (step) {
      case "signup":
        return Boolean(
          signupForm.email.trim() &&
          signupForm.name.trim() &&
          signupForm.password.length >= passwordRequirement
        );
      case "verify":
        return Boolean(otpInput.length === 6);
      case "intake": {
        const height = Number(healthForm.height_cm);
        const respiration = Number(healthForm.respiration_rate);
        const energy = Number(healthForm.energy_consumption);
        const sleep = Number(healthForm.sleep_hours);
        const exercise = Number(healthForm.exercise_minutes_per_week);
        const diet = Number(healthForm.diet_quality);
        const stress = Number(healthForm.stress_level);
        const hydration = Number(healthForm.hydration_liters_per_day);
        const alcohol = Number(healthForm.alcohol_units_per_week);
        const meditation = Number(healthForm.meditation_minutes_per_week);
        const validNumbers =
          Number.isFinite(height) &&
          height > 0 &&
          Number.isFinite(respiration) &&
          respiration > 0 &&
          Number.isFinite(energy) &&
          energy > 0 &&
          Number.isFinite(sleep) &&
          sleep >= 0 &&
          Number.isFinite(exercise) &&
          exercise >= 0 &&
          Number.isFinite(diet) &&
          diet >= 1 &&
          diet <= 5 &&
          Number.isFinite(stress) &&
          stress >= 1 &&
          stress <= 5 &&
          Number.isFinite(hydration) &&
          hydration >= 0 &&
          Number.isFinite(alcohol) &&
          alcohol >= 0 &&
          Number.isFinite(meditation) &&
          meditation >= 0;
        return Boolean(validNumbers);
      }
      case "mini":
        return Boolean(Number(miniForm.scale) > 0);
      case "payment":
        return Boolean(requestId && Number(paymentAmount) > 0);
      case "assessment":
        return Boolean(assessmentForm.narrative.trim().length > 0);
      case "token":
        return Boolean(requestId && dnaTokenId);
      default:
        return true;
    }
  }, [
    assessmentForm.narrative.length,
    dnaTokenId,
    miniForm.scale,
    otpInput,
    paymentAmount,
    requestId,
    signupForm.email,
    signupForm.name,
    signupForm.password,
    passwordRequirement,
    healthForm,
    step,
  ]);

  const handleSignup = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const payload: SignupPayload = {
          email: signupForm.email,
          name: signupForm.name,
          password: signupForm.password,
          location: signupForm.location || undefined,
          initial_insurance_tier: signupForm.initial_insurance_tier,
        };
        const response = await signupHuman(payload);
        setUserId(response.user_id);
        setStep("verify");
        log(`OTP dispatched to ${signupForm.email}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [log, signupForm]
  );

  const handleVerify = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await verifyHuman({ user_id: userId, otp_code: otpInput });
        log("Identity verified. Continue with health intake.");
        setStep("intake");
        setOtpInput("");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [log, otpInput, userId]
  );

  const handleIntake = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const allergies = healthForm.allergies
          ? healthForm.allergies
              .split(",")
              .map((entry: string) => entry.trim())
              .filter(Boolean)
          : undefined;
        const payload: HealthProfilePayload = {
          body_profile: {
            height_cm: Number(healthForm.height_cm),
            weight_kg: healthForm.weight_kg ? Number(healthForm.weight_kg) : undefined,
            blood_type: healthForm.blood_type || undefined,
            allergies,
            notes: healthForm.notes || undefined,
          },
          respiration_rate: Number(healthForm.respiration_rate),
          energy_consumption: Number(healthForm.energy_consumption),
          medical_history: healthForm.medical_history || undefined,
          health_survey: {
            sleep_hours: Number(healthForm.sleep_hours),
            exercise_minutes_per_week: Number(healthForm.exercise_minutes_per_week),
            diet_quality: Number(healthForm.diet_quality),
            stress_level: Number(healthForm.stress_level),
            chronic_condition: healthForm.chronic_condition,
            alcohol_units_per_week: Number(healthForm.alcohol_units_per_week),
            smoker: healthForm.smoker,
            meditation_minutes_per_week: Number(healthForm.meditation_minutes_per_week),
            hydration_liters_per_day: Number(healthForm.hydration_liters_per_day),
          },
        };
        const response = await submitHealthProfile(userId, payload);
        log(`Health intake recorded. Score ${response.health_score} (${response.health_bucket}).`);
        setStep("mini");
        void refreshOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [healthForm, log, refreshOverview, userId]
  );

  const handleMiniRequest = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const payload = {
          scale: Number(miniForm.scale),
          safety_answers: {
            environment: miniForm.environment || "",
            constraints: miniForm.constraints || "",
          },
        };
        const response = await submitMiniaturizationRequest(userId, payload);
        setRequestId(response.request_id);
        setEstimatedCost(response.cost_usd);
        log(`Miniaturization request filed. Estimated cost $${response.cost_usd.toFixed(2)}.`);
        setStep("payment");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [log, miniForm.constraints, miniForm.environment, miniForm.scale, userId]
  );

  const handlePayment = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId || !requestId) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await recordPayment(userId, { request_id: requestId, amount_usd: Number(paymentAmount) });
        log("Invoice settled. DNA vault intake commencing.");
        setStep("assessment");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [log, paymentAmount, requestId, userId]
  );

  const handleAssessment = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const payload: AssessmentPayload = {
          user_id: userId,
          emotional_profile: {
            joy: Number(assessmentForm.joy),
            calm: Number(assessmentForm.calm),
            dread: Number(assessmentForm.dread),
          },
          narrative: assessmentForm.narrative || undefined,
        };
        const response = await recordAssessment(userId, payload);
        setDnaTokenId(response.dna_token_id);
        log("DNA token sealed within the Vault.");
        setStep("token");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [assessmentForm.calm, assessmentForm.dread, assessmentForm.joy, assessmentForm.narrative, log, userId]
  );

  const handleTokenIssue = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!userId || !requestId || !dnaTokenId) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const response = await issueMiniaturizationToken(userId, {
          request_id: requestId,
          dna_token_id: dnaTokenId,
        });
        setIssuedToken(response);
        log("Miniaturization token minted. Awaiting vault clearance.");
        setStep("complete");
        void refreshOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [dnaTokenId, log, refreshOverview, requestId, userId]
  );

  return (
    <div className="user-journey">
      <div className="user-journey__content">
        {step === "signup" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Establish Identity" />
            <form className="user-journey__form" onSubmit={handleSignup}>
              <label className="user-journey__field">
                Email
                <input
                  className="input"
                  type="email"
                  value={signupForm.email}
                  onChange={event => updateSignupForm("email", event.currentTarget.value)}
                  required
                />
              </label>
              <label className="user-journey__field">
                Password
                <input
                  className="input"
                  type="password"
                  value={signupForm.password}
                  onChange={event => updateSignupForm("password", event.currentTarget.value)}
                  minLength={passwordRequirement}
                  required
                />
                <span className="user-journey__hint">
                  Minimum {passwordRequirement} characters. Use a unique passphrase for the vault.
                </span>
              </label>
              <label className="user-journey__field">
                Name
                <input
                  className="input"
                  value={signupForm.name}
                  onChange={event => updateSignupForm("name", event.currentTarget.value)}
                  required
                />
              </label>
              <label className="user-journey__field">
                Location
                <input
                  className="input"
                  value={signupForm.location}
                  onChange={event => updateSignupForm("location", event.currentTarget.value)}
                />
              </label>
              <label className="user-journey__field">
                Initial insurance tier
                <select
                  className="input user-journey__select"
                  value={signupForm.initial_insurance_tier}
                  onChange={event => updateSignupForm("initial_insurance_tier", event.currentTarget.value as InsuranceTier)}
                >
                  {insuranceTierOptions.map(tier => (
                    <option key={tier} value={tier}>
                      {insuranceTierLabels[tier]}
                    </option>
                  ))}
                </select>
                <span className="user-journey__hint">
                  Your chosen tier activates automatically once the miniaturization process completes.
                </span>
              </label>
              <div className="user-journey__controls">
                <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                  {busy ? "Enlisting…" : "Request OTP"}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === "verify" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Verify Access" />
            <p className="text-secondary">Enter the six-digit OTP dispatched to your inbox.</p>
            <form className="user-journey__inline-form" onSubmit={handleVerify} autoComplete="off">
              <input
                className="input user-journey__otp-input"
                autoComplete="off"
                inputMode="numeric"
                pattern="[0-9]*"
                spellCheck={false}
                value={otpInput}
                onChange={event => {
                  const value = event.currentTarget.value.replace(/\D/g, "").slice(0, 6);
                  setOtpInput(value);
                }}
                placeholder="••••••"
              />
              <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                {busy ? "Authenticating…" : "Validate"}
              </button>
            </form>
          </section>
        )}

        {step === "intake" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Complete Health Intake" />
            <form className="user-journey__form" onSubmit={handleIntake}>
              <p className="text-secondary">
                Secure the baseline body profile and lifestyle survey so Marova can compute your health score.
              </p>
              <div className="user-journey__grid user-journey__grid--medium">
                <label className="user-journey__field">
                  Height (cm)
                  <input
                    className="input"
                    type="number"
                    min={10}
                    max={260}
                    value={healthForm.height_cm}
                    onChange={event => updateHealthForm("height_cm", event.currentTarget.value)}
                    required
                  />
                </label>
                <label className="user-journey__field">
                  Weight (kg)
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={400}
                    value={healthForm.weight_kg}
                    onChange={event => updateHealthForm("weight_kg", event.currentTarget.value)}
                  />
                </label>
                <label className="user-journey__field">
                  Blood Type
                  <input
                    className="input"
                    value={healthForm.blood_type}
                    onChange={event => updateHealthForm("blood_type", event.currentTarget.value)}
                  />
                </label>
                <label className="user-journey__field">
                  Respiration Rate (breaths/min)
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={60}
                    step={0.1}
                    value={healthForm.respiration_rate}
                    onChange={event => updateHealthForm("respiration_rate", event.currentTarget.value)}
                    required
                  />
                </label>
                <label className="user-journey__field">
                  Energy Consumption (kWh/day)
                  <input
                    className="input"
                    type="number"
                    min={0.1}
                    max={25}
                    step={0.1}
                    value={healthForm.energy_consumption}
                    onChange={event => updateHealthForm("energy_consumption", event.currentTarget.value)}
                    required
                  />
                </label>
              </div>
              <label className="user-journey__field">
                Allergies (comma separated)
                <input
                  className="input"
                  value={healthForm.allergies}
                  onChange={event => updateHealthForm("allergies", event.currentTarget.value)}
                />
              </label>
              <label className="user-journey__field">
                Notes
                <textarea
                  className="input user-journey__textarea"
                  value={healthForm.notes}
                  onChange={event => updateHealthForm("notes", event.currentTarget.value)}
                />
              </label>
              <label className="user-journey__field">
                Medical History
                <textarea
                  className="input user-journey__textarea"
                  value={healthForm.medical_history}
                  onChange={event => updateHealthForm("medical_history", event.currentTarget.value)}
                  placeholder="Example: Mild asthma, routine medication"
                />
              </label>
              <div className="user-journey__grid user-journey__grid--medium">
                <label className="user-journey__field">
                  Sleep Hours (nightly)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={12}
                    step={0.1}
                    value={healthForm.sleep_hours}
                    onChange={event => updateHealthForm("sleep_hours", event.currentTarget.value)}
                    required
                  />
                </label>
                <label className="user-journey__field">
                  Exercise Minutes (weekly)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={840}
                    value={healthForm.exercise_minutes_per_week}
                    onChange={event => updateHealthForm("exercise_minutes_per_week", event.currentTarget.value)}
                    required
                  />
                </label>
                <label className="user-journey__field">
                  Diet Quality (1-5)
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={5}
                    value={healthForm.diet_quality}
                    onChange={event => updateHealthForm("diet_quality", event.currentTarget.value)}
                    required
                  />
                </label>
                <label className="user-journey__field">
                  Stress Level (1-5)
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={5}
                    value={healthForm.stress_level}
                    onChange={event => updateHealthForm("stress_level", event.currentTarget.value)}
                    required
                  />
                </label>
                <label className="user-journey__field">
                  Alcohol Units (weekly)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={40}
                    value={healthForm.alcohol_units_per_week}
                    onChange={event => updateHealthForm("alcohol_units_per_week", event.currentTarget.value)}
                  />
                </label>
                <label className="user-journey__field">
                  Meditation Minutes (weekly)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={840}
                    value={healthForm.meditation_minutes_per_week}
                    onChange={event => updateHealthForm("meditation_minutes_per_week", event.currentTarget.value)}
                  />
                </label>
                <label className="user-journey__field">
                  Hydration (litres/day)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={6}
                    step={0.1}
                    value={healthForm.hydration_liters_per_day}
                    onChange={event => updateHealthForm("hydration_liters_per_day", event.currentTarget.value)}
                  />
                </label>
              </div>
              <div className="user-journey__grid user-journey__grid--wide">
                <label className="user-journey__field user-journey__field--inline">
                  <input
                    type="checkbox"
                    checked={healthForm.chronic_condition}
                    onChange={event => updateHealthForm("chronic_condition", event.currentTarget.checked)}
                    className="user-journey__checkbox"
                  />
                  Chronic Condition Present
                </label>
                <label className="user-journey__field user-journey__field--inline">
                  <input
                    type="checkbox"
                    checked={healthForm.smoker}
                    onChange={event => updateHealthForm("smoker", event.currentTarget.checked)}
                    className="user-journey__checkbox"
                  />
                  Smoker
                </label>
              </div>
              <div className="user-journey__controls">
                <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                  {busy ? "Encoding…" : "Store Baseline"}
                </button>
              </div>
            </form>
          </section>
        )}

        {step === "mini" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Configure Miniaturization" />
            <form className="user-journey__form" onSubmit={handleMiniRequest}>
              <label className="user-journey__field">
                Target Scale (0.001 - 0.5)
                <input
                  className="input"
                  type="number"
                  min={0.001}
                  max={0.5}
                  step={0.001}
                  value={miniForm.scale}
                  onChange={event => updateMiniForm("scale", event.currentTarget.value)}
                  required
                />
              </label>
              <label className="user-journey__field">
                Environmental Constraints
                <textarea
                  className="input user-journey__textarea"
                  value={miniForm.environment}
                  onChange={event => updateMiniForm("environment", event.currentTarget.value)}
                  placeholder="Example: Requires sterile chamber, minimal acoustic interference"
                />
              </label>
              <label className="user-journey__field">
                Safety Notes
                <textarea
                  className="input user-journey__textarea"
                  value={miniForm.constraints}
                  onChange={event => updateMiniForm("constraints", event.currentTarget.value)}
                  placeholder="Example: Allergic to nitrogen buffers"
                />
              </label>
              <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                {busy ? "Calculating…" : "Submit Request"}
              </button>
            </form>
          </section>
        )}

        {step === "payment" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Settle Invoice" />
            <p className="text-secondary">
              Miniaturization rate is <strong>$100</strong> per <strong>0.01×</strong> reduction. Estimated charge:
              <strong> ${estimatedCost ? estimatedCost.toFixed(2) : "pending"}</strong>.
            </p>
            <form className="user-journey__inline-form" onSubmit={handlePayment}>
              <input
                className="input user-journey__payment-input"
                type="number"
                min={0}
                step={0.01}
                value={paymentAmount}
                onChange={event => {
                  const value = event.currentTarget.value;
                  setPaymentAmount(value);
                }}
              />
              <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                {busy ? "Processing…" : "Capture Payment"}
              </button>
            </form>
          </section>
        )}

        {step === "assessment" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Encode Personality" />
            <form className="user-journey__form" onSubmit={handleAssessment}>
              <div className="user-journey__grid user-journey__grid--small">
                <label className="user-journey__field">
                  Joy (0-1)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={assessmentForm.joy}
                    onChange={event => updateAssessmentForm("joy", event.currentTarget.value)}
                  />
                </label>
                <label className="user-journey__field">
                  Calm (0-1)
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={assessmentForm.calm}
                    onChange={event => updateAssessmentForm("calm", event.currentTarget.value)}
                  />
                </label>
                <label className="user-journey__field">
                  Dread (-1 to 1)
                  <input
                    className="input"
                    type="number"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={assessmentForm.dread}
                    onChange={event => updateAssessmentForm("dread", event.currentTarget.value)}
                  />
                </label>
              </div>
              <label className="user-journey__field">
                Narrative Capsule
                <textarea
                  className="input user-journey__textarea"
                  value={assessmentForm.narrative}
                  onChange={event => updateAssessmentForm("narrative", event.currentTarget.value)}
                  required
                />
              </label>
              <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                {busy ? "Encoding…" : "Seal DNA Token"}
              </button>
            </form>
          </section>
        )}

        {step === "token" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Issue Miniaturization Token" />
            <form className="user-journey__inline-form" onSubmit={handleTokenIssue}>
              <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                {busy ? "Minting…" : "Generate Token"}
              </button>
              <button
                type="button"
                className="pill-button pill-button--outline-neutral user-journey__button user-journey__button--slim"
                onClick={() => void refreshOverview()}
              >
                Sync Timeline
              </button>
            </form>
          </section>
        )}

        {step === "complete" && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <SectionTitle step={step} title="Await Vault Clearance" />
            <p>
              Miniaturization token <strong>{issuedToken?.token_id}</strong> is now queued for admin approval. You will be
              notified once Marova authorizes the procedure.
            </p>
            <div className="user-journey__controls">
              <button type="button" className="pill-button user-journey__button" onClick={() => void refreshOverview()}>
                Refresh Status
              </button>
            </div>
          </section>
        )}

        {error && (
          <div
            className="surface-card account__panel user-journey__panel user-journey__alert user-journey__alert--error"
            data-scroll-fade
          >
            <strong>Transmission Error:</strong> {error}
          </div>
        )}
      </div>

      <aside className="user-journey__aside">
        <section
          className="surface-card account__panel user-journey__panel user-journey__panel--status"
          data-scroll-fade
        >
          <h3 className="user-journey__panel-title">Signup Telemetry</h3>
          <p className="user-journey__hint">Real-time status updates from the onboarding pipeline.</p>
          <ul className="user-journey__status-list">
            {statusLog.length === 0 && <li className="user-journey__status-empty">No signals yet — begin the sequence.</li>}
            {statusLog.map((entry, index) => (
              <li key={index} className="user-journey__status-item">
                {entry}
              </li>
            ))}
          </ul>
        </section>

        <Timeline overview={overview} />

        {overview && (
          <section
            className="surface-card account__panel user-journey__panel"
            data-scroll-fade
          >
            <h3 className="user-journey__panel-title">Current Stage</h3>
            <p>
              <strong>{overview.user.current_stage.toUpperCase()}</strong>
            </p>
            <p className="text-secondary">User ID: {overview.user.id}</p>
            <p className="text-secondary">Status: {overview.user.status}</p>
          </section>
        )}
      </aside>
    </div>
  );
}
