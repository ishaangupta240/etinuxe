import { CSSProperties, MouseEvent } from "react";

import { UserOverview } from "../api";
import { makeSurface, pillButtonStyle, theme } from "../theme";

interface UserOverviewModalProps {
  open: boolean;
  overview: UserOverview | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export function UserOverviewModal({ open, overview, loading, error, onClose }: UserOverviewModalProps): JSX.Element | null {
  if (!open) {
    return null;
  }

  const stop = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={modalContentStyle} onClick={stop}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Human dossier</h2>
          <button
            type="button"
            onClick={onClose}
            style={pillButtonStyle({ background: "transparent", color: theme.textPrimary, padding: "6px 14px" })}
          >
            Close
          </button>
        </header>
        {loading ? (
          <p style={{ color: theme.textSecondary }}>Retrieving records...</p>
        ) : error ? (
          <p style={{ color: theme.danger }}>Failed to load user details: {error}</p>
        ) : overview ? (
          <UserOverviewCard overview={overview} />
        ) : (
          <p style={{ color: theme.textSecondary }}>No dossier available.</p>
        )}
      </div>
    </div>
  );
}

export function UserOverviewCard({ overview }: { overview: UserOverview }): JSX.Element {
  const { user, requests, payments, health_profile: healthProfile } = overview;
  const latestRequest = [...requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: "1.1rem" }}>{user.name}</strong>
          <p style={{ margin: "4px 0", color: theme.textSecondary }}>{user.email}</p>
          {user.location && <p style={{ margin: 0, color: theme.textSecondary }}>Location: {user.location}</p>}
        </div>
        <span style={stageChipStyle}>{user.current_stage.replace(/_/g, " ")}</span>
      </div>

      <div style={statsGridStyle}>
        <InfoChip label="Requests" value={requests.length.toString()} />
        <InfoChip label="Payments" value={payments.length.toString()} />
        <InfoChip label="Status" value={user.status.replace("_", " ")} />
        <InfoChip label="Updated" value={new Date(user.updated_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} />
        <InfoChip label="Health Score" value={healthProfile.health_score.toString()} />
        <InfoChip label="Health Bucket" value={healthProfile.bucket_label} />
      </div>

      {user.body_profile ? <BodyProfileDetails body={user.body_profile} /> : null}

      {healthProfile.health_summary && (
        <div style={{ borderRadius: 14, border: `1px solid ${theme.outline}`, padding: "10px 12px" }}>
          <strong style={{ fontSize: "0.9rem" }}>Health notes</strong>
          <p style={{ margin: "4px 0", color: theme.textSecondary }}>{healthProfile.health_summary}</p>
        </div>
      )}

      {healthProfile.health_inputs && (
        <div style={healthInputsCardStyle}>
          <strong style={{ fontSize: "0.9rem" }}>Health inputs</strong>
          <div style={healthInputsGridStyle}>
            {Object.entries(healthProfile.health_inputs)
              .filter(([, value]) => value !== null && value !== undefined && value !== "")
              .map(([key, value]) => {
                const label = healthInputLabels[key] ?? key.replace(/_/g, " ");
                const formatted = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
                return (
                  <span key={key} style={{ color: theme.textSecondary, fontSize: "0.85rem" }}>
                    <strong style={{ color: theme.textPrimary }}>{label}:</strong> {formatted}
                  </span>
                );
              })}
          </div>
        </div>
      )}

      {latestRequest ? (
        <div style={{ borderRadius: 14, border: `1px solid ${theme.outline}`, padding: "10px 12px" }}>
          <strong style={{ fontSize: "0.9rem" }}>Latest request</strong>
          <p style={{ margin: "4px 0", color: theme.textSecondary }}>
            Scale {latestRequest.scale.toFixed(3)}x | {latestRequest.status}
          </p>
          <p style={{ margin: 0, color: theme.textSecondary }}>
            Submitted {new Date(latestRequest.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
          </p>
          {latestRequest.staff_health_rating != null && (
            <p style={{ margin: "4px 0", color: theme.textSecondary }}>
              Staff health rating {latestRequest.staff_health_rating}/100
            </p>
          )}
        </div>
      ) : (
        <p style={{ margin: 0, color: theme.textSecondary }}>No miniaturization requests filed.</p>
      )}
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ background: theme.surfaceTonal, border: `1px solid ${theme.outline}`, borderRadius: 12, padding: "10px 12px" }}>
      <span style={{ fontSize: "0.75rem", color: theme.textSecondary }}>{label}</span>
      <strong style={{ display: "block", marginTop: 4 }}>{value}</strong>
    </div>
  );
}

function BodyProfileDetails({ body }: { body: NonNullable<UserOverview["user"]["body_profile"]> }): JSX.Element | null {
  const entries: Array<[string, string | number | undefined | string[]]> = [
    ["Height", body.height_cm ? `${body.height_cm} cm` : undefined],
    ["Weight", body.weight_kg ? `${body.weight_kg} kg` : undefined],
    ["Blood", body.blood_type],
    ["Allergies", body.allergies && body.allergies.length ? body.allergies.join(", ") : undefined],
  ];

  const visible = entries.filter(([, value]) => Boolean(value));
  if (visible.length === 0 && !body.notes) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <strong style={{ fontSize: "0.85rem" }}>Body profile</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        {visible.map(([label, value]) => (
          <span key={label} style={{ color: theme.textSecondary, fontSize: "0.85rem" }}>
            <strong style={{ color: theme.textPrimary }}>{label}:</strong> {value}
          </span>
        ))}
      </div>
      {body.notes && <p style={{ margin: 0, color: theme.textSecondary }}>Notes: {body.notes}</p>}
    </div>
  );
}

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const stageChipStyle: CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${theme.accent}`,
  background: theme.accentSoft,
  padding: "6px 16px",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: theme.accent,
};

const healthInputsCardStyle: CSSProperties = {
  borderRadius: 14,
  border: `1px solid ${theme.outline}`,
  padding: "10px 12px",
  display: "grid",
  gap: 8,
};

const healthInputsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

const healthInputLabels: Record<string, string> = {
  sleep_hours: "Sleep (hrs/night)",
  exercise_minutes_per_week: "Exercise (min/week)",
  diet_quality: "Diet quality",
  stress_level: "Stress level",
  chronic_condition: "Chronic condition",
  alcohol_units_per_week: "Alcohol (units/week)",
  smoker: "Smoker",
  meditation_minutes_per_week: "Meditation (min/week)",
  hydration_liters_per_day: "Hydration (L/day)",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(5,0,15,0.75)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 1000,
};

const modalContentStyle: CSSProperties = {
  ...makeSurface({ padding: 32, borderRadius: 26 }),
  width: "min(720px, 100%)",
  maxHeight: "80vh",
  overflowY: "auto",
  display: "grid",
  gap: 16,
};
