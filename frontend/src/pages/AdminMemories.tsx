import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchMemoryLogs, fetchMemoryTokens, MemoryLogRecord, MemoryTokenRecord, updateMemoryTokenStatus } from "../api";

import "./admin-common.css";
import "./AdminMemories.css";

const uuidPattern = /^[0-9a-fA-F-]{32,36}$/;

export default function AdminMemories(): JSX.Element {
  const [filterInput, setFilterInput] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<MemoryLogRecord[]>([]);
  const [tokens, setTokens] = useState<MemoryTokenRecord[]>([]);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [updatingTokenId, setUpdatingTokenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const trimmed = appliedFilter.trim();
    if (trimmed && !uuidPattern.test(trimmed)) {
      setError("Provide a valid user UUID to filter memory data.");
      setLogs([]);
      setTokens([]);
      setInitializing(false);
      return;
    }

    setError(null);
    setRefreshing(true);
    try {
      const params = trimmed ? { userId: trimmed } : {};
      const [logResponse, tokenResponse] = await Promise.all([fetchMemoryLogs(params), fetchMemoryTokens(params)]);
      const sortedLogs = [...logResponse.logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const sortedTokens = [...tokenResponse.tokens].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setLogs(sortedLogs);
      setTokens(sortedTokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
      setInitializing(false);
    }
  }, [appliedFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredTokens = useMemo(() => {
    if (!showOnlyAvailable) {
      return tokens;
    }
    return tokens.filter(token => !token.spent);
  }, [showOnlyAvailable, tokens]);

  const tokenStats = useMemo(() => {
    const totalPoints = tokens.reduce((sum, token) => sum + token.amount, 0);
    const availablePoints = tokens.filter(token => !token.spent).reduce((sum, token) => sum + token.amount, 0);
    const totalCount = tokens.length;
    const availableCount = tokens.filter(token => !token.spent).length;
    return {
      totalPoints,
      availablePoints,
      spentPoints: totalPoints - availablePoints,
      totalCount,
      availableCount,
    };
  }, [tokens]);

  const handleApplyFilter = useCallback(() => {
    setAppliedFilter(filterInput.trim());
  }, [filterInput]);

  const handleClearFilter = useCallback(() => {
    setFilterInput("");
    setAppliedFilter("");
  }, []);

  const handleToggleToken = useCallback(async (token: MemoryTokenRecord) => {
    setError(null);
    setUpdatingTokenId(token.id);
    try {
      const updated = await updateMemoryTokenStatus(token.id, !token.spent);
      setTokens(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingTokenId(null);
    }
  }, []);

  if (initializing) {
    return <section className="surface-card admin-panel">Aligning memory streams…</section>;
  }

  return (
    <section className="admin-memories admin-page">
      <header className="surface-card admin-panel admin-panel--compact admin-memories__header">
        <div className="admin-header admin-memories__header-main">
          <div>
            <h1 className="admin-title">Memory Management</h1>
            <p className="text-secondary">
              Review submitted memories, reconcile point ledgers, and optionally filter by candidate.
            </p>
          </div>
          <div className="admin-actions admin-memories__actions">
            <input
              type="text"
              value={filterInput}
              onChange={event => setFilterInput(event.target.value)}
              placeholder="Filter by user UUID"
              className="input input--wide"
            />
            <button type="button" className="pill-button pill-button--regular" onClick={handleApplyFilter}>
              Apply filter
            </button>
            <button
              type="button"
              className="pill-button pill-button--outline-accent"
              onClick={handleClearFilter}
            >
              Clear
            </button>
            <button
              type="button"
              className="pill-button pill-button--regular"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="admin-card-grid admin-memories__metrics">
          <div className="admin-metric-card">
            <span className="admin-badge">Tokens</span>
            <strong className="admin-metric-card__value">{tokenStats.totalCount}</strong>
          </div>
          <div className="admin-metric-card">
            <span className="admin-badge">Available tokens</span>
            <strong className="admin-metric-card__value">{tokenStats.availableCount}</strong>
          </div>
          <div className="admin-metric-card">
            <span className="admin-badge">Available points</span>
            <strong className="admin-metric-card__value">{tokenStats.availablePoints.toFixed(2)}</strong>
          </div>
          <div className="admin-metric-card">
            <span className="admin-badge">Spent points</span>
            <strong className="admin-metric-card__value">{tokenStats.spentPoints.toFixed(2)}</strong>
          </div>
        </div>
      </header>

      {error && (
        <section className="surface-card admin-panel admin-panel--error">
          <p className="admin-memories__error">{error}</p>
        </section>
      )}

      <section className="surface-card admin-panel">
        <div className="admin-toggle-row admin-memories__toggle-row">
          <h2 className="admin-section-title">Memory Tokens</h2>
          <label className="admin-memories__toggle">
            <input
              type="checkbox"
              checked={showOnlyAvailable}
              onChange={event => setShowOnlyAvailable(event.target.checked)}
            />
            Show only available tokens
          </label>
        </div>
        <div className="admin-card-grid admin-memories__tokens">
          {filteredTokens.length === 0 ? (
            <p className="admin-empty">No tokens match the current filters.</p>
          ) : (
            filteredTokens.map(token => (
              <article key={token.id} className="admin-token-card">
                <div className="admin-memories__token-header">
                  <strong className="admin-memories__token-title">Token {token.id.slice(0, 8)}</strong>
                  <span className={`admin-status ${token.spent ? "admin-status--negative" : "admin-status--positive"}`}>
                    {token.spent ? "Spent" : "Available"}
                  </span>
                </div>
                <span className="admin-inline-meta">
                  Points {token.amount.toFixed(2)} · User {token.user_id.slice(0, 8)} · Log {token.log_id.slice(0, 8)}
                </span>
                <span className="admin-inline-meta">
                  Minted {new Date(token.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  {token.spent_at ? ` · Spent ${new Date(token.spent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}
                </span>
                <div className="admin-memories__token-actions">
                  <button
                    type="button"
                    className="pill-button pill-button--slim"
                    onClick={() => void handleToggleToken(token)}
                    disabled={updatingTokenId === token.id}
                  >
                    {updatingTokenId === token.id ? "Updating…" : token.spent ? "Restore token" : "Mark spent"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="surface-card admin-panel">
        <h2 className="admin-section-title">Memory Logs</h2>
        <div className="admin-card-grid admin-memories__logs">
          {logs.length === 0 ? (
            <p className="admin-empty">No memory logs available for this view.</p>
          ) : (
            logs.map(log => (
              <article key={log.id} className="admin-log-card">
                <strong className="admin-memories__log-title">{truncateMemoryText(log.memory_text)}</strong>
                <span className="admin-inline-meta">
                  Valence {log.valence.toFixed(2)} · Strength {log.strength.toFixed(2)} · Toxicity {log.toxicity.toFixed(2)}
                </span>
                <span className="admin-inline-meta">
                  Reward {log.tokens_awarded.toFixed(2)} points · User {log.user_id.slice(0, 8)}
                </span>
                <span className="admin-inline-meta">
                  Logged {new Date(log.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </span>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

function truncateMemoryText(body: string, limit = 200): string {
  if (body.length <= limit) {
    return body;
  }
  return `${body.slice(0, limit - 3)}...`;
}
