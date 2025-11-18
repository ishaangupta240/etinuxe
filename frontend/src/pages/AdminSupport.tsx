import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchAdminSupportSessions,
  fetchUserOverview,
  sendAdminSupportMessage,
  SupportSessionRecord,
  SupportSessionStatus,
  updateSupportSession,
  UserOverview,
} from "../api";
import { UserOverviewModal } from "../components/UserOverviewModal";

import "./admin-common.css";
import "./AdminSupport.css";

const filterChips: Array<{ label: string; value: "all" | SupportSessionStatus }> = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Assigned", value: "assigned" },
  { label: "Resolved", value: "resolved" },
];

const statusModifier = (status: SupportSessionStatus): string => status.replace(/_/g, "-");

interface AdminSupportProps {
  adminId: string;
  adminName: string;
}

export default function AdminSupport({ adminId, adminName }: AdminSupportProps): JSX.Element {
  const [sessions, setSessions] = useState<SupportSessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [filter, setFilter] = useState<"all" | SupportSessionStatus>("open");
  const [userOverview, setUserOverview] = useState<UserOverview | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userDetailsError, setUserDetailsError] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const data = await fetchAdminSupportSessions();
      data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setSessions(data);
      setSelectedSessionId(prev => {
        if (prev && data.some(session => session.id === prev)) {
          return prev;
        }
        return data[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const filteredSessions = useMemo(() => {
    if (filter === "all") {
      return sessions;
    }
    return sessions.filter(session => session.status === filter);
  }, [filter, sessions]);

  const activeSession = useMemo(
    () => sessions.find(session => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions]
  );
  const activeUserId = activeSession?.user_id ?? null;

  useEffect(() => {
    if (!activeUserId) {
      setUserOverview(null);
      setUserDetailsError(null);
      setUserModalOpen(false);
      return;
    }
    let cancelled = false;
    setUserLoading(true);
    setUserDetailsError(null);
    fetchUserOverview(activeUserId)
      .then(data => {
        if (!cancelled) {
          setUserOverview(data);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setUserDetailsError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUserLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeUserId]);

  const handleSendMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!activeSession || !messageDraft.trim()) {
        return;
      }
      setSending(true);
      setError(null);
      try {
        const updated = await sendAdminSupportMessage(activeSession.id, {
          admin_id: adminId,
          body: messageDraft.trim(),
        });
        setSessions(prev => prev.map(session => (session.id === updated.id ? updated : session)));
        setMessageDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [activeSession, adminId, messageDraft]
  );

  const handleAssign = useCallback(async () => {
    if (!activeSession) {
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      const updated = await updateSupportSession(activeSession.id, {
        admin_id: adminId,
        assigned_admin_id: adminId,
      });
      setSessions(prev => prev.map(session => (session.id === updated.id ? updated : session)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(false);
    }
  }, [activeSession, adminId]);

  const handleStatusChange = useCallback(
    async (status: SupportSessionStatus) => {
      if (!activeSession) {
        return;
      }
      setStatusUpdating(true);
      setError(null);
      try {
        const updated = await updateSupportSession(activeSession.id, {
          admin_id: adminId,
          status,
        });
        setSessions(prev => prev.map(session => (session.id === updated.id ? updated : session)));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStatusUpdating(false);
      }
    },
    [activeSession, adminId]
  );

  if (initializing) {
    return <section className="surface-card admin-panel">Syncing distress beacons…</section>;
  }

  return (
    <div className="admin-support admin-page">
  <header className="admin-support__header admin-header">
        <div>
          <h1 className="admin-title">Support Desk</h1>
          <p className="text-secondary">Coordinate live with humans requesting assistance.</p>
        </div>
        <button
          type="button"
          className="pill-button pill-button--regular"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && <div className="admin-support__error">{error}</div>}

      <div className="admin-support__content">
        <aside className="surface-card admin-panel admin-support__sidebar">
          <div className="admin-support__filters">
            {filterChips.map(chip => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setFilter(chip.value)}
                className={`admin-support__chip${chip.value === filter ? " is-active" : ""}`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="admin-support__session-list">
            {filteredSessions.map(session => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className={`admin-support__session-button${session.id === selectedSessionId ? " is-active" : ""}${session.distress ? " is-distress" : ""}`}
              >
                <strong className="admin-support__session-title">
                  <span>{session.subject}</span>
                  {session.distress && <span className="admin-support__distress-badge">Distress</span>}
                </strong>
                <div className="admin-support__session-meta">
                  <span>User {session.user_id.slice(0, 6)}…</span>
                  <span className="admin-support__session-status-wrapper">
                    Status:
                    <span className={`admin-support__session-status admin-support__session-status--${statusModifier(session.status)}`}>
                      {session.status}
                    </span>
                  </span>
                </div>
                <div className="admin-support__session-timestamp">
                  Updated {new Date(session.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </div>
              </button>
            ))}
            {filteredSessions.length === 0 && <p className="admin-empty">No sessions in this column.</p>}
          </div>
        </aside>

        <section className="surface-card admin-panel admin-support__main">
          {activeSession ? (
            <>
              <div className="admin-support__main-header">
                <div>
                  <h2 className="admin-section-title">{activeSession.subject}</h2>
                  <p className="text-secondary admin-support__main-subtitle">
                    User {activeSession.user_id} · {activeSession.messages.length} messages
                  </p>
                  {activeSession.assigned_admin_name && (
                    <p className="text-secondary admin-support__main-subtitle">
                      Assigned to {activeSession.assigned_admin_name}
                    </p>
                  )}
                </div>
                <div className="admin-support__main-actions">
                  <div className="admin-support__main-actions-row">
                    <StatusBadge status={activeSession.status} />
                    <button
                      type="button"
                      onClick={() => setUserModalOpen(true)}
                      disabled={userLoading || !!userDetailsError || !userOverview}
                      className="pill-button pill-button--outline-neutral"
                    >
                      {userLoading ? "Loading dossier…" : "View user"}
                    </button>
                  </div>
                  <div className="admin-support__main-actions-row">
                    {activeSession.assigned_admin_id !== adminId && activeSession.status !== "resolved" && (
                      <button
                        type="button"
                        onClick={() => void handleAssign()}
                        className="pill-button pill-button--slim"
                        disabled={assigning}
                      >
                        {assigning ? "Claiming…" : "Assign to Me"}
                      </button>
                    )}
                    {activeSession.status !== "resolved" && (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange("resolved")}
                        className="pill-button pill-button--outline-neutral"
                        disabled={statusUpdating}
                      >
                        {statusUpdating ? "Updating…" : "Mark Resolved"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-support__message-list">
                {activeSession.messages.map(message => (
                  <article
                    key={message.id}
                    className={`admin-support__message${message.sender_role === "admin" ? " admin-support__message--admin" : ""}`}
                  >
                    <strong className="admin-support__message-author">
                      {message.sender_role === "admin" ? message.sender_name : "Human"}
                    </strong>
                    <p className="admin-support__message-body">{message.body}</p>
                    <span className="admin-support__message-time">
                      {new Date(message.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </span>
                  </article>
                ))}
                {activeSession.messages.length === 0 && <p className="admin-empty">No transmissions logged yet.</p>}
              </div>

              {activeSession.status !== "resolved" ? (
                <form onSubmit={handleSendMessage} className="admin-support__composer">
                  <textarea
                    value={messageDraft}
                    onChange={event => setMessageDraft(event.target.value)}
                    placeholder="Send a message"
                    rows={4}
                    className="admin-support__textarea"
                  />
                  <button type="submit" className="pill-button" disabled={sending || !messageDraft.trim()}>
                    {sending ? "Sending…" : `Respond as ${adminName}`}
                  </button>
                </form>
              ) : (
                <p className="admin-support__info text-secondary">Session resolved. Switch to another session when ready.</p>
              )}
            </>
          ) : (
            <div className="admin-support__empty-state text-secondary">
              <p>Select a session from the left rail to begin.</p>
            </div>
          )}
        </section>
      </div>

      <UserOverviewModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        overview={userOverview}
        loading={userLoading}
        error={userDetailsError}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: SupportSessionStatus }): JSX.Element {
  return (
    <span className={`admin-support__status admin-support__status--${statusModifier(status)}`}>
      {status}
    </span>
  );
}
