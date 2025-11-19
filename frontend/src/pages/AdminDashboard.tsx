import { useMemo } from "react";

import { useAdminOverview } from "../hooks/useAdminOverview";

import "./admin-common.css";
import "./AdminDashboard.css";

interface AdminDashboardProps {
  onNavigate?: (path: string) => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps): JSX.Element {
  const { overview, loading, error, refresh } = useAdminOverview();

  const summary = useMemo(() => overview?.summary, [overview]);

  if (loading) {
    return <p>Signal acquisition in progress…</p>;
  }

  if (error) {
    return (
      <div className="surface-card admin-panel admin-panel--error admin-dashboard__panel">
        <strong>Admin telemetry error:</strong> {error}
      </div>
    );
  }

  if (!overview || !summary) {
    return <p>No admin data available.</p>;
  }

  const recentDreams = [...overview.dreams.slice(-3)].reverse();
  const recentCycles = [...overview.sleep_cycles.slice(-3)].reverse();
  const operations: Array<{
    title: string;
    description: string;
    path: string;
    metric: string;
  }> = [
    {
      title: "Human Registry",
      description: "Review every enrolled human and their current stage progression.",
      path: "/admin/users",
      metric: `${overview.users.length} records`,
    },
    {
      title: "Requests & Tokens",
      description: "Audit requests and manage token approvals from a unified console.",
      path: "/admin/requests",
      metric: `${overview.requests.length} requests · ${overview.miniaturization_tokens.length} tokens`,
    },
    {
      title: "Memory Vault",
      description: "Audit memory submissions, resonance rewards, and token ledgers.",
      path: "/admin/memories",
      metric: `${overview.memory_tokens.length} tokens`,
    },
    {
      title: "Payments",
      description: "Trace invoices and revenue across the EtinuxE pipeline.",
      path: "/admin/payments",
      metric: `${overview.payments.length} payments`,
    },
    {
      title: "Pricing",
      description: "Tune scale thresholds, insurance tiers, and per-step pricing.",
      path: "/admin/pricing",
      metric: `${overview.settings.pricing_per_step.toFixed(2)} / step`,
    },
  ];

  return (
    <div className="admin-dashboard admin-page">
      <div>
        <section className="surface-card admin-panel admin-dashboard__panel" style={{ marginBottom: '2vh' }}>
          <div className="admin-dashboard__panel-header admin-header">
            <h2 className="admin-dashboard__panel-title admin-title">Command Overview</h2>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate("/admin/marova")}
                className="pill-button pill-button--small"
              >
                View Marova Vault
              </button>
            )}
          </div>
          <div className="admin-dashboard__summary-grid">
            <SummaryChip label="Users" value={summary.total_users.toLocaleString()} />
            <SummaryChip label="Requests" value={summary.total_requests.toLocaleString()} />
            <SummaryChip label="Payments" value={summary.total_payments.toLocaleString()} />
            <SummaryChip label="Revenue" value={`$${summary.total_revenue.toFixed(2)}`} />
            <SummaryChip label="Insurance Policies" value={summary.insurance_policies.toString()} />
            <SummaryChip label="Insurance MRR" value={`$${summary.insurance_recurring_revenue.toFixed(2)}`} />
            <SummaryChip label="Pending Tokens" value={summary.pending_tokens.toString()} />
            <SummaryChip label="Approved Tokens" value={summary.approved_tokens.toString()} />
            <SummaryChip label="Dream Energy" value={summary.dream_energy.toFixed(2)} />
            <SummaryChip label="DNA Reserve" value={summary.dna_energy.toFixed(2)} />
            <SummaryChip label="Sleep Cycles" value={summary.sleep_cycles.toString()} />
            <SummaryChip label="Sleep Quality" value={`${Math.round(summary.avg_sleep_quality * 100)}%`} />
          </div>
        </section>
        <section className="surface-card admin-panel admin-dashboard__panel" style={{ marginBottom: '2vh' }}>
          <div className="admin-dashboard__panel-header admin-header">
            <h2 className="admin-dashboard__panel-title admin-title">Operations Console</h2>
            <button
              type="button"
              className="pill-button pill-button--tiny"
              onClick={() => void refresh()}
            >
              Refresh Data
            </button>
          </div>
          <div className="admin-dashboard__operations">
            {operations.map(operation => (
              <article key={operation.path} className="admin-dashboard__operation">
                <div>
                  <h3 className="admin-dashboard__operation-title">{operation.title}</h3>
                  <p className="text-secondary">{operation.description}</p>
                </div>
                <div className="admin-dashboard__operation-meta">
                  <span className="admin-dashboard__operation-metric">{operation.metric}</span>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate(operation.path)}
                      className="pill-button pill-button--micro"
                    >
                      Open
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="surface-card admin-panel admin-dashboard__panel">
          <h2 className="admin-dashboard__panel-title admin-title">Dream Engine</h2>
          {recentDreams.length === 0 ? (
            <p className="text-secondary">No dream activity logged yet.</p>
          ) : (
            <div className="admin-dashboard__dreams">
              {recentDreams.map(dream => (
                <article key={dream.id} className={`dream-card${dream.category === "nightmare" ? " dream-card--nightmare" : ""}`}>
                  <header className="dream-card__header">
                    <strong className="dream-card__category">{dream.category}</strong>
                    <span className="dream-card__timestamp">
                      {new Date(dream.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </span>
                  </header>
                  <p className="dream-card__body text-secondary">
                    Outcome: <strong>{dream.outcome}</strong> · Intensity {dream.intensity.toFixed(2)} · Energy
                    {" "}
                    {dream.energy_used.toFixed(2)} (state {dream.state_energy_used.toFixed(2)} · DNA {dream.dna_energy_used.toFixed(2)})
                  </p>
                  <p className="dream-card__foot text-secondary">
                    Memory tokens consumed: {dream.memory_tokens_consumed} · Effects: {dream.effects.join(", ") || "none"}
                  </p>
                </article>
              ))}
            </div>
          )}
          <div className="admin-dashboard__cycles">
            <h3 className="admin-dashboard__cycles-title admin-section-title">
              Recent Sleep Cycles
            </h3>
            {recentCycles.length === 0 ? (
              <p className="text-secondary">No sleep cycles recorded.</p>
            ) : (
              <ul className="admin-dashboard__cycles-list">
                {recentCycles.map(cycle => (
                  <li key={cycle.id} className="cycle-item">
                    <span>
                      {cycle.duration_hours.toFixed(1)}h @ {(cycle.quality * 100).toFixed(0)}% quality{cycle.abrupt_wake ? " · abrupt wake" : ""}
                    </span>
                    <span className="cycle-item__timestamp">
                      {new Date(cycle.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <aside className="admin-dashboard__aside">
        <section className="surface-card admin-panel admin-dashboard__panel">
          <h2 className="admin-dashboard__panel-title admin-title">Marova Snapshot</h2>
          <p className="text-secondary">Hunger: {overview.organism_state.hunger.toFixed(2)}</p>
          <p className="text-secondary">Metabolism: {overview.organism_state.metabolism.toFixed(2)}</p>
          <p className="text-secondary">Mood: {overview.organism_state.mood}</p>
          <p className="text-secondary">Dream phase: {overview.organism_state.sleep_phase}</p>
          <p className="text-secondary">Dream energy: {overview.organism_state.dream_energy.toFixed(2)}</p>
          <p className="text-secondary">Dream debt: {overview.organism_state.dream_debt.toFixed(2)}</p>
          <p className="text-secondary">Toxicity: {overview.organism_state.toxicity_level.toFixed(2)}</p>
          <p className="text-secondary">
            Sensitivity window: θ {overview.organism_state.sensitivity_threshold.toFixed(2)} · immunity {overview.organism_state.toxicity_resistance.toFixed(2)} · tolerance {overview.organism_state.dream_tolerance.toFixed(2)}
          </p>
          <p className="admin-dashboard__aside-meta text-secondary">
            Last feed: {overview.organism_state.last_feed ? new Date(overview.organism_state.last_feed).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "never"}
          </p>
          <p className="admin-dashboard__aside-meta text-secondary">
            Last sleep: {overview.organism_state.last_sleep ? new Date(overview.organism_state.last_sleep).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "never"}
          </p>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("/admin/marova")}
              className="pill-button pill-button--tiny"
            >
              Open Marova Vault
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="summary-chip">
      <span className="summary-chip__label">{label}</span>
      <strong className="summary-chip__value">{value}</strong>
    </div>
  );
}
