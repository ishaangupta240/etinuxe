import { useMemo, useState } from "react";

import { MiniaturizationStatus, updateTokenStatus } from "../api";
import { useAdminOverview } from "../hooks/useAdminOverview";

import "./admin-common.css";
import "./AdminTokens.css";

export default function AdminTokens(): JSX.Element {
  const { overview, loading, error, refresh } = useAdminOverview();
  const [statusFilter, setStatusFilter] = useState<"all" | MiniaturizationStatus>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const tokens = overview?.miniaturization_tokens ?? [];
  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (overview?.users ?? []).forEach(user => {
      map[user.id] = user.name;
    });
    return map;
  }, [overview?.users]);
  const getUserName = (userId: string) => userNameMap[userId] ?? `${userId.slice(0, 10)}…`;
  const filtered = useMemo(() => {
    if (statusFilter === "all") {
      return tokens;
    }
    return tokens.filter(token => token.status === statusFilter);
  }, [statusFilter, tokens]);

  const handleStatusUpdate = async (tokenId: string, status: MiniaturizationStatus) => {
    setMutationError(null);
    setUpdatingId(tokenId);
    try {
      await updateTokenStatus(tokenId, status);
      await refresh();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return <section className="surface-card admin-panel">Aligning miniaturization tokens…</section>;
  }

  if (error) {
    return (
      <section className="surface-card admin-panel admin-panel--error">
        <p className="admin-tokens__message">{error}</p>
      </section>
    );
  }

  return (
    <section className="admin-tokens admin-page">
      <header className="admin-header admin-tokens__header">
        <div>
          <h1 className="admin-title">Miniaturization Tokens</h1>
          <p className="text-secondary">{filtered.length} tokens in view</p>
        </div>
        <div className="admin-actions admin-tokens__actions">
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as "all" | MiniaturizationStatus)}
            className="input"
          >
            <option value="all">All statuses</option>
            <option value="awaiting_approval">Awaiting approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
          </select>
          <button type="button" className="pill-button pill-button--regular" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      {mutationError && (
        <div className="surface-card admin-panel admin-panel--error">
          <p className="admin-tokens__message">{mutationError}</p>
        </div>
      )}

      <section className="surface-card admin-panel admin-tokens__grid-panel">
        {filtered.length === 0 ? (
          <p className="admin-empty">No tokens in this column.</p>
        ) : (
          <div className="admin-card-grid admin-tokens__grid">
            {filtered.map(token => (
              <article key={token.id} className="admin-token-card">
                <div className="admin-token-card__header">
                  <div>
                    <p className="admin-inline-meta">Token</p>
                    <strong className="admin-token-card__title">{token.id.slice(0, 10)}…</strong>
                  </div>
                  <span className={`admin-status-chip admin-status-chip--${token.status.replace("_", "-")}`}>
                    {token.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="admin-inline-meta" title={token.user_id}>
                  User {getUserName(token.user_id)}
                </p>
                <p className="admin-inline-meta">Request {token.request_id.slice(0, 10)}…</p>
                <p className="admin-inline-meta">
                  Created {new Date(token.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
                <div className="admin-token-card__actions">
                  <TokenActions
                    current={token.status}
                    busy={updatingId === token.id}
                    onChange={next => void handleStatusUpdate(token.id, next)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function TokenActions({
  current,
  busy,
  onChange,
}: {
  current: MiniaturizationStatus;
  busy: boolean;
  onChange: (status: MiniaturizationStatus) => void;
}): JSX.Element {
  const options: MiniaturizationStatus[] = ["awaiting_approval", "approved", "rejected", "completed"];
  return (
    <div className="admin-tokens__token-actions">
      <select
        value={current}
        onChange={event => onChange(event.target.value as MiniaturizationStatus)}
        disabled={busy}
        className="input"
      >
        {options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="pill-button pill-button--slim"
        onClick={() => onChange("completed")}
        disabled={busy || current === "completed"}
      >
        {busy ? "Updating…" : "Mark Complete"}
      </button>
    </div>
  );
}
