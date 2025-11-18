import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchUserOverview, UserOverview } from "../api";

import "./Account.css";
import "./HealthProfile.css";

type HealthProfileProps = {
  userId: string;
  onNavigate: (path: string) => void;
};

type Metric = {
  label: string;
  value: string;
  hint: string;
};

export default function HealthProfile({ userId, onNavigate }: HealthProfileProps): JSX.Element {
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUserOverview(userId);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const profile = overview?.health_profile ?? null;
  const dnaProfile = overview?.dna_profile ?? null;

  const coreMetrics = useMemo<Metric[]>(() => {
    if (!profile) {
      return [];
    }
    return [
      {
        label: "Health score",
        value: profile.health_score.toFixed(0),
        hint: profile.bucket_label,
      },
      {
        label: "Respiration",
        value: profile.respiration_rate.toFixed(2),
        hint: "breaths per minute",
      },
      {
        label: "Energy",
        value: profile.energy_consumption.toFixed(2),
        hint: "indexed units",
      },
    ];
  }, [profile]);

  const healthRisks = profile?.health_risks ?? [];

  const dnaMetrics = useMemo<Metric[]>(() => {
    if (!dnaProfile) {
      return [];
    }
    return [
      {
        label: "Profile ID",
        value: dnaProfile.id,
        hint: "",
      },
      {
        label: "Respiration",
        value: dnaProfile.respiration_rate.toFixed(2),
        hint: "breaths / min",
      },
      {
        label: "Energy",
        value: dnaProfile.energy_consumption.toFixed(2),
        hint: "indexed units",
      },
      {
        label: "Health bucket",
        value: dnaProfile.health_bucket,
        hint: "",
      },
    ];
  }, [dnaProfile]);

  return (
    <div className="health-profile">
      <section className="surface-card account__panel health-profile__panel" data-scroll-fade>
        <header className="health-profile__header">
          <div>
            <h2 className="health-profile__title">Health Profile</h2>
            <p className="health-profile__subtitle text-secondary">
              Review baseline respiration, energy consumption, and lifestyle telemetry captured during intake.
            </p>
          </div>
          <div className="health-profile__actions">
            <button
              type="button"
              className="pill-button pill-button--outline-neutral pill-button--slim"
              onClick={() => onNavigate("/account")}
            >
              Back to dashboard
            </button>
            <button
              type="button"
              className="pill-button"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? "Syncing..." : "Refresh"}
            </button>
          </div>
        </header>

        {error ? <div className="health-profile__alert health-profile__alert--error">{error}</div> : null}

        {loading && !profile ? (
          <p className="text-secondary">Fetching health telemetry...</p>
        ) : profile ? (
          <div className="health-profile__body">
            <div className="health-profile__metric-grid">
              {coreMetrics.map(metric => (
                <article key={metric.label} className="health-profile__metric" data-scroll-fade="off">
                  <span className="health-profile__metric-label">{metric.label}</span>
                  <strong className="health-profile__metric-value">{metric.value}</strong>
                  <span className="health-profile__metric-hint text-secondary">{metric.hint}</span>
                </article>
              ))}
            </div>

            {profile.medical_history ? (
              <article className="health-profile__card" data-scroll-fade="off">
                <h3 className="health-profile__card-title">Medical History</h3>
                <p className="health-profile__card-body text-secondary">{profile.medical_history}</p>
              </article>
            ) : (
              <p className="text-secondary">No medical annotations captured at intake.</p>
            )}

            {profile.health_summary ? (
              <article className="health-profile__card" data-scroll-fade="off">
                <h3 className="health-profile__card-title">Summary</h3>
                <p className="health-profile__card-body text-secondary">{profile.health_summary}</p>
              </article>
            ) : null}

            {healthRisks.length > 0 ? (
              <article className="health-profile__card health-profile__card--warning" data-scroll-fade="off">
                <h3 className="health-profile__card-title">Elevated Risks</h3>
                <ul className="health-profile__list">
                  {healthRisks.map(risk => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </article>
            ) : null}

            <span className="health-profile__timestamp text-secondary">
              {dnaProfile?.updated_at
                ? `Profile refreshed ${new Date(dnaProfile.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
                : "Profile locked at signup."}
            </span>
          </div>
        ) : (
          <p className="text-secondary">No health payload recorded yet. Complete signup to capture vitals.</p>
        )}
      </section>

      <section className="surface-card account__panel health-profile__panel" data-scroll-fade>
        <h3 className="health-profile__section-title">DNA Vault Snapshot</h3>
        {dnaProfile ? (
          <ul className="health-profile__list">
            {dnaMetrics.map(metric => (
              <li key={metric.label} className="health-profile__stat">
                <strong className="health-profile__stat-label">{metric.label}</strong>
                <span className="health-profile__stat-value">{metric.value}</span>
                {metric.hint ? <span className="text-secondary">{metric.hint}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-secondary">
            DNA telemetry has not been sealed yet. Complete the assessment to mint your DNA profile record.
          </p>
        )}
      </section>
    </div>
  );
}
