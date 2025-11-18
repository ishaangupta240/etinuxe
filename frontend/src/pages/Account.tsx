import { useCallback, useEffect, useState } from "react";

import { fetchUserOverview, InsurancePolicyRecord, UserOverview } from "../api";

import "./Account.css";

type AccountProps = {
  userId: string;
  email: string;
  name: string;
  onLogout: () => void;
  onNavigate: (path: string) => void;
};

export default function Account({ userId, email, name, onLogout, onNavigate }: AccountProps): JSX.Element {
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
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
    void loadOverview();
  }, [loadOverview]);

  const stageLabel = overview ? overview.user.current_stage.replace(/_/g, " ") : "Awaiting stage";
  const statusLabel = overview ? overview.user.status.replace(/_/g, " ") : "Status pending";
  const healthProfile = overview?.health_profile ?? null;
  const healthLabel = healthProfile ? healthProfile.bucket_label : "Awaiting health data";
  const healthScore = healthProfile ? healthProfile.health_score : null;
  const activePolicyCount = (overview?.insurance_policies ?? []).filter(policy => policy.status === "active").length;

  return (
    <section className="account">
      <header className="surface-card account__header">
        <div className="account__intro">
          <h2 className="account__intro-title">Welcome back, {name}.</h2>
          <p className="text-secondary">
            Use the modules below to log memories, inspect health telemetry, or contact support.
          </p>
        </div>
        <div className="account__status-row">
          <span className="badge">Stage: {stageLabel.toUpperCase()}</span>
          <span className="badge">Status: {statusLabel.toUpperCase()}</span>
          <span className="badge">Health: {healthLabel.toUpperCase()}</span>
          <span className={`badge${activePolicyCount > 0 ? " badge--positive" : ""}`}>
            Insurance: {activePolicyCount > 0 ? `${activePolicyCount} active` : "not active"}
          </span>
          {healthScore !== null ? (
            <span className="badge badge--positive">
              Score: {healthScore}
            </span>
          ) : null}
        </div>
        <div className="account__action-row">
          <button type="button" className="pill-button" onClick={loadOverview} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh dashboard"}
          </button>
          <button type="button" className="pill-button pill-button--warm" onClick={onLogout}>
            Log out
          </button>
        </div>
        {error ? (
          <div className="account__error">
            {error}
          </div>
        ) : null}
      </header>

      <div className="account__grid">
        <IdentityPanel userId={userId} email={email} overview={overview} loading={loading} />
        <NavigationPanel onNavigate={onNavigate} overview={overview} loading={loading} />
        <InsurancePanel onNavigate={onNavigate} overview={overview} loading={loading} />
      </div>
    </section>
  );
}

function IdentityPanel({ userId, email, overview, loading }: { userId: string; email: string; overview: UserOverview | null; loading: boolean }): JSX.Element {
  const userRecord = overview?.user ?? null;
  const summary = overview?.memory_summary ?? null;
  const lastLog = overview?.memory_logs?.[0] ?? null;

  return (
  <section className="surface-card account__panel account__panel--compact">
      <div className="account__panel-header">
        <h3 className="account__panel-title">Account Snapshot</h3>
        <p className="text-secondary">Identifiers and the latest log activity.</p>
      </div>
      <ul className="account__info-list">
        <li className="account__info-item">
          <span className="label label--secondary">User ID</span>
          <strong>{userId}</strong>
        </li>
        <li className="account__info-item">
          <span className="label label--secondary">Email</span>
          <strong>{email}</strong>
        </li>
        <li className="account__info-item">
          <span className="label label--secondary">Stage</span>
          <strong>{userRecord ? userRecord.current_stage.replace(/_/g, " ").toUpperCase() : loading ? "..." : "N/A"}</strong>
        </li>
        <li className="account__info-item">
          <span className="label label--secondary">Location</span>
          <strong>{userRecord?.location ?? "Not set"}</strong>
        </li>
      </ul>
      <div className="account__stat-grid">
        <div className="stat-tile">
          <span className="label label--secondary">Total Points</span>
          <strong className="stat-tile__value">{summary ? summary.total_points.toFixed(0) : loading ? "..." : "0"}</strong>
        </div>
        <div className="stat-tile">
          <span className="label label--secondary">Available</span>
          <strong className="stat-tile__value">{summary ? summary.available_points.toFixed(0) : loading ? "..." : "0"}</strong>
        </div>
        <div className="stat-tile">
          <span className="label label--secondary">Logs</span>
          <strong className="stat-tile__value">{summary ? String(summary.logs_recorded) : loading ? "..." : "0"}</strong>
        </div>
      </div>
      {lastLog ? (
        <div className="account__last-memory">
          <strong className="account__last-memory-title">Last Memory</strong>
          <p className="text-secondary">{truncateMemory(lastLog.memory_text, 160)}</p>
          <span className="label label--muted">{new Date(lastLog.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
        </div>
      ) : (
        <p className="text-secondary">No memories logged yet.</p>
      )}
    </section>
  );
}

function NavigationPanel({
  onNavigate,
  overview,
  loading,
}: {
  onNavigate: (path: string) => void;
  overview: UserOverview | null;
  loading: boolean;
}): JSX.Element {
  const summary = overview?.memory_summary ?? null;
  const health = overview?.health_profile ?? null;

  return (
    <section className="surface-card account__panel">
      <div className="account__panel-header">
        <h3 className="account__panel-title">Dashboard Modules</h3>
        <p className="text-secondary">
          Manage coverage, log memories, review vitals, or contact the support desk.
        </p>
      </div>

      <div className="account__module-grid">
        <button
          type="button"
          className="pill-button pill-button--block pill-button--success"
          onClick={() => onNavigate("/account/insurance")}
        >
          <span>
            <strong className="pill-button__title">Manage Insurance</strong>
            <span className="pill-button__subtitle text-secondary">
              Preview quotes and activate coverage for approved procedures.
            </span>
          </span>
          <span className="pill-button__icon">→</span>
        </button>
        <button
          type="button"
          className="pill-button pill-button--block"
          onClick={() => onNavigate("/account/memory")}
        >
          <span>
            <strong className="pill-button__title">Open Memory Forge</strong>
            <span className="pill-button__subtitle pill-button__subtitle--dark">
              Log one memory per hour and review recent rewards.
            </span>
          </span>
          <span className="pill-button__icon">→</span>
        </button>
        <button
          type="button"
          className="pill-button pill-button--block pill-button--violet"
          onClick={() => onNavigate("/account/health")}
        >
          <span>
            <strong className="pill-button__title">View Health Profile</strong>
            <span className="pill-button__subtitle text-secondary">
              Inspect respiration, energy usage, and archival medical notes.
            </span>
          </span>
          <span className="pill-button__icon">→</span>
        </button>
        <button
          type="button"
          className="pill-button pill-button--block pill-button--light"
          onClick={() => onNavigate("/account/support")}
        >
          <span>
            <strong className="pill-button__title">Support & Care</strong>
            <span className="pill-button__subtitle text-secondary">
              Connect with the EtinuxE staff for guidance or emergency escalation.
            </span>
          </span>
          <span className="pill-button__icon">→</span>
        </button>
      </div>

      <div className="account__stat-grid account__stat-grid--compact">
        <div className="stat-tile">
          <span className="label label--secondary">Memory Points</span>
          <strong className="stat-tile__value">{summary ? summary.total_points.toFixed(0) : loading ? "..." : "0"}</strong>
          <span className="stat-tile__hint text-secondary">
            Logs recorded {summary ? summary.logs_recorded : loading ? "…" : 0}
          </span>
        </div>
        <div className="stat-tile">
          <span className="label label--secondary">Health Score</span>
          <strong className="stat-tile__value">{health ? health.health_score : loading ? "..." : "--"}</strong>
          <span className="stat-tile__hint text-secondary">{health ? health.bucket_label : "Awaiting vitals"}</span>
        </div>
      </div>
    </section>
  );
}

function InsurancePanel({
  onNavigate,
  overview,
  loading,
}: {
  onNavigate: (path: string) => void;
  overview: UserOverview | null;
  loading: boolean;
}): JSX.Element {
  const policies = overview?.insurance_policies ?? [];
  const activePolicies = policies.filter(policy => policy.status === "active");
  const nextBilling = findNextBilling(activePolicies);

  return (
    <section className="surface-card account__panel">
      <div className="account__panel-header">
        <h3 className="account__panel-title">Insurance Status</h3>
        <p className="text-secondary">
          Track active coverage and your upcoming billing schedule. Open the hub to adjust tiers.
        </p>
      </div>

      <div className="account__stat-grid account__stat-grid--compact">
        <div className="stat-tile">
          <span className="label label--secondary">Active Policies</span>
          <strong className="stat-tile__value">{loading ? "..." : activePolicies.length}</strong>
          <span className="stat-tile__hint text-secondary">Includes monthly billing</span>
        </div>
        <div className="stat-tile">
          <span className="label label--secondary">Next Billing</span>
          <strong className="stat-tile__value stat-tile__value--small">{loading ? "..." : nextBilling ? formatInsuranceDate(nextBilling) : "Not scheduled"}</strong>
          <span className="stat-tile__hint text-secondary">Soonest upcoming charge</span>
        </div>
      </div>

      <button type="button" className="pill-button pill-button--center" onClick={() => onNavigate("/account/insurance")}
      >
        Open insurance hub
      </button>

      {activePolicies.length > 0 ? (
        <div className="account__coverage">
          <strong className="account__coverage-title">Current coverage</strong>
          {activePolicies.map(policy => (
            <div key={policy.id} className="account__coverage-item">
              <span>{policy.id} · {policy.tier.toUpperCase()} · {policy.request_id}</span>
              <span className="account__coverage-meta text-secondary">
                Monthly: ${policy.final_premium.toFixed(2)} · Next billing {formatInsuranceDate(policy.next_billing_at)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-secondary">Activate insurance to protect your approved procedures.</p>
      )}
    </section>
  );
}

function truncateMemory(body: string, limit = 160): string {
  if (body.length <= limit) {
    return body;
  }
  return `${body.slice(0, limit - 3)}...`;
}

function findNextBilling(policies: InsurancePolicyRecord[]): string | null {
  const future = policies
    .map(policy => {
      if (!policy.next_billing_at) {
        return null;
      }
      const parsed = new Date(policy.next_billing_at);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    })
    .filter((date): date is Date => date !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return future.length > 0 ? future[0].toISOString() : null;
}

function formatInsuranceDate(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return "—";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });
}
