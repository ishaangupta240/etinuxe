import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { fetchUserOverview, recordMemoryLog, MemoryLogPayload, UserOverview } from "../api";

import "./Account.css";
import "./MemoryForge.css";

type MemoryForgeProps = {
  userId: string;
  onNavigate: (path: string) => void;
};

export default function MemoryForge({ userId, onNavigate }: MemoryForgeProps): JSX.Element {
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [memoryText, setMemoryText] = useState("");
  const [valence, setValence] = useState(0);
  const [strength, setStrength] = useState(0.6);
  const [toxicity, setToxicity] = useState(0.2);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refreshOverview = useCallback(async () => {
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
    void refreshOverview();
  }, [refreshOverview]);

  const sortedTokens = useMemo(() => {
    const tokens = overview?.memory_tokens ?? [];
    return [...tokens].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [overview]);

  const sortedLogs = useMemo(() => {
    const logs = overview?.memory_logs ?? [];
    return [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [overview]);

  const recentTokens = sortedTokens.slice(0, 6);
  const recentLogs = sortedLogs.slice(0, 6);
  const summary = overview?.memory_summary ?? null;

  const metrics = [
    { label: "Total points", value: summary ? summary.total_points.toFixed(0) : loading ? "..." : "0" },
    { label: "Available", value: summary ? summary.available_points.toFixed(0) : loading ? "..." : "0" },
    { label: "Spent", value: summary ? summary.spent_points.toFixed(0) : loading ? "..." : "0" },
    { label: "Logs", value: summary ? String(summary.logs_recorded) : loading ? "..." : "0" },
  ];

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = memoryText.trim();
      if (!trimmed) {
        setErrorMessage("Describe the memory before submitting.");
        setStatusMessage(null);
        return;
      }

      setSubmitting(true);
      setErrorMessage(null);
      setStatusMessage(null);

      try {
        const clampedValence = Math.max(-1, Math.min(1, Number(valence)));
        const clampedStrength = Math.max(0, Math.min(1, Number(strength)));
        const clampedToxicity = Math.max(0, Math.min(1, Number(toxicity)));

        const payload: MemoryLogPayload = {
          valence: clampedValence,
          strength: clampedStrength,
          toxicity: clampedToxicity,
          embedding: [clampedValence, clampedStrength, Math.max(0, 1 - clampedToxicity)],
          memory_text: trimmed,
          timestamp: new Date().toISOString(),
        };

        await recordMemoryLog(userId, payload);
        setMemoryText("");
        setStatusMessage("Memory stored. 100 points minted. Next window opens in one hour.");
        await refreshOverview();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
      } finally {
        setSubmitting(false);
      }
    },
    [memoryText, refreshOverview, strength, toxicity, userId, valence]
  );

  const handleManualRefresh = useCallback(() => {
    setStatusMessage(null);
    setErrorMessage(null);
    void refreshOverview();
  }, [refreshOverview]);

  return (
    <div className="memory-forge">
      <section className="surface-card account__panel memory-forge__panel" data-scroll-fade>
        <div className="memory-forge__header">
          <div>
            <h2 className="memory-forge__title">Memory Forge</h2>
            <p className="memory-forge__subtitle text-secondary">
              Submit one memory per hour to sustain resonance. Each accepted log mints exactly 100 points.
            </p>
          </div>
          <div className="memory-forge__actions">
            <button
              type="button"
              className="pill-button pill-button--outline-neutral pill-button--slim"
              onClick={() => onNavigate("/account")}
            >
              Back to dashboard
            </button>
            <button type="button" className="pill-button" onClick={handleManualRefresh} disabled={loading}>
              {loading ? "Syncing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error ? <div className="memory-forge__alert memory-forge__alert--error">{error}</div> : null}

        <div className="memory-forge__metrics">
          {metrics.map(metric => (
            <div key={metric.label} className="memory-forge__metric">
              <span className="memory-forge__metric-label">{metric.label}</span>
              <strong className="memory-forge__metric-value">{metric.value}</strong>
            </div>
          ))}
        </div>

        <form className="memory-forge__form" onSubmit={handleSubmit}>
          <label className="memory-forge__field">
            <span className="memory-forge__field-label">Memory text</span>
            <textarea
              className="memory-forge__textarea"
              value={memoryText}
              onChange={event => {
                setMemoryText(event.target.value);
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              maxLength={2000}
              placeholder="Describe a sensory-rich memory for Marova to metabolize."
              required
              rows={6}
            />
          </label>
          <div className="memory-forge__inputs">
            <label className="memory-forge__field">
              <span className="memory-forge__field-label">Valence (-1 to 1)</span>
              <input
                className="input"
                type="number"
                min={-1}
                max={1}
                step={0.1}
                value={valence}
                onChange={event => {
                  const next = Number(event.target.value);
                  setValence(Number.isNaN(next) ? 0 : next);
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
              />
            </label>
            <label className="memory-forge__field">
              <span className="memory-forge__field-label">Strength (0 to 1)</span>
              <input
                className="input"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={strength}
                onChange={event => {
                  const next = Number(event.target.value);
                  setStrength(Number.isNaN(next) ? 0.6 : next);
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
              />
            </label>
            <label className="memory-forge__field">
              <span className="memory-forge__field-label">Toxicity (0 to 1)</span>
              <input
                className="input"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={toxicity}
                onChange={event => {
                  const next = Number(event.target.value);
                  setToxicity(Number.isNaN(next) ? 0.2 : next);
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
              />
            </label>
          </div>
          <button type="submit" className="pill-button" disabled={submitting}>
            {submitting ? "Transmitting..." : "Log memory"}
          </button>
        </form>

        {statusMessage ? (
          <div className="memory-forge__alert memory-forge__alert--status">{statusMessage}</div>
        ) : null}
        {errorMessage ? (
          <div className="memory-forge__alert memory-forge__alert--error">{errorMessage}</div>
        ) : null}
      </section>

      <section className="surface-card account__panel memory-forge__panel" data-scroll-fade>
        <div className="memory-forge__dual">
          <div className="memory-forge__list-section">
            <h3 className="memory-forge__section-title">Recent tokens</h3>
            {recentTokens.length === 0 ? (
              <p className="text-secondary">No memory tokens minted yet.</p>
            ) : (
              <ul className="memory-forge__list">
                {recentTokens.map(token => (
                  <li key={token.id} className="memory-forge__list-item">
                    <strong className="memory-forge__list-heading">Token {token.id.slice(0, 8)}</strong>
                    <span>Amount {token.amount.toFixed(0)} points · {token.spent ? "Spent" : "Available"}</span>
                    <span className="memory-forge__list-meta">
                      {new Date(token.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="memory-forge__list-section">
            <h3 className="memory-forge__section-title">Recent logs</h3>
            {recentLogs.length === 0 ? (
              <p className="text-secondary">Log a memory to populate this feed.</p>
            ) : (
              <ul className="memory-forge__list">
                {recentLogs.map(entry => (
                  <li key={entry.id} className="memory-forge__list-item">
                    <strong className="memory-forge__list-heading">{truncateMemory(entry.memory_text)}</strong>
                    <span>Valence {entry.valence.toFixed(2)} · Strength {entry.strength.toFixed(2)} · Toxicity {entry.toxicity.toFixed(2)}</span>
                    <span>Reward {entry.tokens_awarded.toFixed(0)} points</span>
                    <span className="memory-forge__list-meta">
                      {new Date(entry.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function truncateMemory(body: string, limit = 160): string {
  if (body.length <= limit) {
    return body;
  }
  return `${body.slice(0, limit - 3)}...`;
}
