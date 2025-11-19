import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  MiniaturizationStage,
  UserRecord,
  resendSignupOtp,
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

type UserJourneyProps = {
  mode?: "new" | "resume";
  userId?: string;
  userEmail?: string;
  onStageUpdate?: (stage: MiniaturizationStage, status: UserRecord["status"]) => void;
  onComplete?: () => void;
};

const OTP_COOLDOWN_SECONDS = 60;
const FINALIZED_STAGES = new Set<MiniaturizationStage>(["awaiting_procedure", "miniaturized"]);

function resolveJourneyStep(overview: UserOverview): JourneyStep {
  const { user } = overview;
  if (user.status !== "verified") {
    return "verify";
  }

  const hasBodyProfile = Boolean(user.body_profile);
  const hasRequest = overview.requests.length > 0;
  const hasPayment = overview.payments.length > 0;
  const hasDnaToken = overview.dna_tokens.length > 0;
  const hasMiniToken = overview.miniaturization_tokens.length > 0;

  if (!hasBodyProfile) {
    return "intake";
  }
  if (!hasRequest) {
    return "mini";
  }
  if (!hasPayment) {
    return "payment";
  }
  if (!hasDnaToken) {
    return "assessment";
  }
  if (!hasMiniToken) {
    return "token";
  }
  return "complete";
}

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

export default function UserJourney(props: UserJourneyProps = {}): JSX.Element {
  const { mode = "new", userId: initialUserId, userEmail, onStageUpdate, onComplete } = props;

  const [step, setStep] = useState<JourneyStep>(mode === "resume" ? "verify" : "signup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  const [userId, setUserId] = useState<string | null>(() => initialUserId ?? null);
  const [otpInput, setOtpInput] = useState("");
  const [otpCooldown, setOtpCooldown] = useState<number>(0);
  const [resendBusy, setResendBusy] = useState(false);

  const [requestId, setRequestId] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("");

  const [dnaTokenId, setDnaTokenId] = useState<string | null>(null);
  const [issuedToken, setIssuedToken] = useState<TokenIssueResponse | null>(null);
  const [overview, setOverview] = useState<UserOverview | null>(null);

  const previousStageRef = useRef<MiniaturizationStage | null>(null);
  const initialHydrateRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const initialFetchRef = useRef(false);
  const verifyPrimedRef = useRef(false);

  const log = useCallback((message: string) => {
    setStatusLog(logs => [message, ...logs.slice(0, 8)]);
  }, []);

  const [signupForm, setSignupForm] = useState<SignupFormState>({
    email: userEmail ?? "",
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
    if (estimatedCost !== null && paymentAmount.trim().length === 0) {
      setPaymentAmount(estimatedCost.toFixed(2));
    }
  }, [estimatedCost, paymentAmount]);

  const hydrateFromOverview = useCallback(
    (data: UserOverview, context: "initial" | "sync" = "sync") => {
      setOverview(data);
      setUserId(data.user.id);

      onStageUpdate?.(data.user.current_stage, data.user.status);

      const nextStep = resolveJourneyStep(data);
      setStep(nextStep);

      const previousStage = previousStageRef.current;
      const stageChanged = previousStage !== null && previousStage !== data.user.current_stage;
      if (context === "initial" && mode === "resume" && !initialHydrateRef.current) {
        log(`Continuing at stage ${data.user.current_stage.toUpperCase()}.`);
        initialHydrateRef.current = true;
      } else if (stageChanged) {
        log(`Stage advanced to ${data.user.current_stage.toUpperCase()}.`);
      }
      previousStageRef.current = data.user.current_stage;

      if (nextStep !== "verify") {
        setOtpCooldown(0);
        setOtpInput("");
      }

      setSignupForm(prev => ({
        ...prev,
        email: data.user.email ?? prev.email,
        name: data.user.name ?? prev.name,
        location: data.user.location ?? prev.location,
      }));

      const body = data.user.body_profile;
      const survey = data.health_profile?.health_inputs;

      setHealthForm(prev => ({
        ...prev,
        height_cm:
          body?.height_cm !== undefined && body.height_cm !== null
            ? String(body.height_cm)
            : prev.height_cm,
        weight_kg:
          body?.weight_kg !== undefined && body.weight_kg !== null
            ? String(body.weight_kg)
            : prev.weight_kg,
        blood_type: body?.blood_type ?? prev.blood_type,
        allergies: Array.isArray(body?.allergies)
          ? body?.allergies.join(", ")
          : body?.allergies === null
            ? ""
            : prev.allergies,
        notes: body?.notes ?? prev.notes,
        respiration_rate: String(data.user.respiration_rate),
        energy_consumption: String(data.user.energy_consumption),
        medical_history:
          data.health_profile?.medical_history ?? data.user.medical_history ?? prev.medical_history,
        sleep_hours:
          survey?.sleep_hours !== undefined
            ? String(survey.sleep_hours)
            : prev.sleep_hours,
        exercise_minutes_per_week:
          survey?.exercise_minutes_per_week !== undefined
            ? String(survey.exercise_minutes_per_week)
            : prev.exercise_minutes_per_week,
        diet_quality:
          survey?.diet_quality !== undefined
            ? String(survey.diet_quality)
            : prev.diet_quality,
        stress_level:
          survey?.stress_level !== undefined
            ? String(survey.stress_level)
            : prev.stress_level,
        chronic_condition: survey?.chronic_condition ?? prev.chronic_condition,
        alcohol_units_per_week:
          survey?.alcohol_units_per_week !== undefined
            ? String(survey.alcohol_units_per_week)
            : prev.alcohol_units_per_week,
        smoker: survey?.smoker ?? prev.smoker,
        meditation_minutes_per_week:
          survey?.meditation_minutes_per_week !== undefined
            ? String(survey.meditation_minutes_per_week)
            : prev.meditation_minutes_per_week,
        hydration_liters_per_day:
          survey?.hydration_liters_per_day !== undefined
            ? String(survey.hydration_liters_per_day)
            : prev.hydration_liters_per_day,
      }));

      const latestRequest = data.requests.length > 0 ? data.requests[data.requests.length - 1] : null;
      if (latestRequest) {
        setMiniForm(prev => ({
          ...prev,
          scale: String(latestRequest.scale),
          environment: latestRequest.safety_answers?.environment ?? "",
          constraints: latestRequest.safety_answers?.constraints ?? "",
        }));
      }
      setRequestId(latestRequest ? latestRequest.id : null);
      setEstimatedCost(latestRequest ? latestRequest.cost_usd : null);

      const latestPayment = data.payments.length > 0 ? data.payments[data.payments.length - 1] : null;
      if (latestPayment) {
        setPaymentAmount(latestPayment.amount_usd.toFixed(2));
      } else if (latestRequest) {
        setPaymentAmount(latestRequest.cost_usd.toFixed(2));
      } else {
        setPaymentAmount("");
      }

      const latestDnaToken = data.dna_tokens.length > 0 ? data.dna_tokens[data.dna_tokens.length - 1] : null;
      setDnaTokenId(latestDnaToken ? latestDnaToken.id : null);

      const latestAssessment = data.assessments.length > 0 ? data.assessments[data.assessments.length - 1] : null;
      if (latestAssessment) {
        const profile = latestAssessment.emotional_profile ?? {};
        setAssessmentForm(prev => ({
          ...prev,
          joy: profile.joy !== undefined ? String(profile.joy) : prev.joy,
          calm: profile.calm !== undefined ? String(profile.calm) : prev.calm,
          dread: profile.dread !== undefined ? String(profile.dread) : prev.dread,
          narrative: latestAssessment.narrative ?? prev.narrative,
        }));
      }

      const latestMiniToken =
        data.miniaturization_tokens.length > 0
          ? data.miniaturization_tokens[data.miniaturization_tokens.length - 1]
          : null;
      setIssuedToken(
        latestMiniToken
          ? {
              token_id: latestMiniToken.id,
              status: latestMiniToken.status,
            }
          : null
      );

      if (nextStep === "complete" && FINALIZED_STAGES.has(data.user.current_stage) && onComplete && !completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onComplete();
      }
    },
    [log, mode, onComplete, onStageUpdate]
  );

  const refreshOverview = useCallback(
    async (context: "initial" | "sync" = "sync") => {
      if (!userId) {
        return;
      }
      try {
        const data = await fetchUserOverview(userId);
        hydrateFromOverview(data, context);
      } catch (err) {
        console.error(err);
      }
    },
    [hydrateFromOverview, userId]
  );

  useEffect(() => {
    if (mode !== "resume" || !userEmail) {
      return;
    }
    log(`Continuing onboarding for ${userEmail}.`);
  }, [log, mode, userEmail]);

  useEffect(() => {
    if (mode !== "resume" || !userEmail) {
      return;
    }
    setSignupForm(prev => ({ ...prev, email: userEmail }));
  }, [mode, userEmail]);

  useEffect(() => {
    if (mode !== "resume" || !userId || initialFetchRef.current) {
      return;
    }
    initialFetchRef.current = true;
    void refreshOverview("initial");
  }, [mode, refreshOverview, userId]);

  useEffect(() => {
    if (step !== "verify") {
      verifyPrimedRef.current = false;
      return;
    }
    if (!verifyPrimedRef.current) {
      verifyPrimedRef.current = true;
      setOtpCooldown(current => (current > 0 ? current : OTP_COOLDOWN_SECONDS));
    }
  }, [step]);

  useEffect(() => {
    if (otpCooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setOtpCooldown(current => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [otpCooldown]);

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
        setOtpCooldown(OTP_COOLDOWN_SECONDS);
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
        const response = await verifyHuman({ user_id: userId, otp_code: otpInput });
        log("Identity verified. Continue with health intake.");
        onStageUpdate?.(
          response.stage,
          response.status === "verified" ? "verified" : "pending_verification"
        );
        setStep("intake");
        setOtpInput("");
        setOtpCooldown(0);
        void refreshOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [log, onStageUpdate, otpInput, refreshOverview, userId]
  );

  const handleResendOtp = useCallback(async () => {
    if (!userId) {
      return;
    }
    setResendBusy(true);
    setError(null);
    try {
      await resendSignupOtp(userId);
      setOtpCooldown(OTP_COOLDOWN_SECONDS);
      log("OTP regenerated and dispatched.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResendBusy(false);
    }
  }, [log, userId]);

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
        setPaymentAmount(response.cost_usd.toFixed(2));
        log(`Miniaturization request filed. Estimated cost $${response.cost_usd.toFixed(2)}.`);
        onStageUpdate?.("request_submitted", "verified");
        setStep("payment");
        void refreshOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [log, miniForm.constraints, miniForm.environment, miniForm.scale, onStageUpdate, refreshOverview, userId]
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
        onStageUpdate?.("payment_captured", "verified");
        setStep("assessment");
        void refreshOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [log, onStageUpdate, paymentAmount, refreshOverview, requestId, userId]
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
        onStageUpdate?.("assessment_complete", "verified");
        setStep("token");
        void refreshOverview();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [assessmentForm.calm, assessmentForm.dread, assessmentForm.joy, assessmentForm.narrative, log, onStageUpdate, refreshOverview, userId]
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
        onStageUpdate?.("awaiting_procedure", "verified");
        setStep("complete");
        void refreshOverview();
        if (onComplete && !completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onComplete();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [dnaTokenId, log, onComplete, onStageUpdate, refreshOverview, requestId, userId]
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
                  Minimum {passwordRequirement} characters.
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
            <p className="text-secondary">
              Enter the six-digit OTP dispatched to {signupForm.email ? signupForm.email : "your inbox"}.
            </p>
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
            <div className="user-journey__controls">
              <button
                type="button"
                className="pill-button pill-button--ghost user-journey__button"
                onClick={() => void handleResendOtp()}
                disabled={!userId || resendBusy || otpCooldown > 0 || busy}
              >
                {resendBusy ? "Sending…" : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend OTP"}
              </button>
              <span className="text-secondary">
                {otpCooldown > 0
                  ? "A new code is available once the timer completes."
                  : "Need another code? You can request a resend every 60 seconds."}
              </span>
            </div>
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
                readOnly
              />
              <button type="submit" className="pill-button user-journey__button" disabled={!canProceed || busy}>
                {busy ? "Processing…" : "Capture Payment"}
              </button>
            </form>
            <p className="user-journey__hint">Amount is auto-calculated from your miniaturization request.</p>
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
