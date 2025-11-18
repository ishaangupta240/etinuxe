import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  closeUserSupportSession,
  createSupportSession,
  fetchUserSupportSessions,
  sendUserSupportMessage,
  SupportSessionRecord,
} from "../api";

import "./Account.css";
import "./SupportCare.css";

type SupportCareProps = {
  userId: string;
  userName: string;
  onNavigate: (path: string) => void;
};

export default function SupportCare({ userId, userName, onNavigate }: SupportCareProps): JSX.Element {
  const [sessions, setSessions] = useState<SupportSessionRecord[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [compose, setCompose] = useState({ subject: "", message: "", distress: false });
  const [sending, setSending] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [closing, setClosing] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const data = await fetchUserSupportSessions(userId);
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
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const activeSession = sessions.find(session => session.id === selectedSessionId) ?? null;

  const handleCompose = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!compose.subject.trim() || !compose.message.trim()) {
        return;
      }
      setSending(true);
      setError(null);
      try {
        const session = await createSupportSession(userId, {
          subject: compose.subject.trim(),
          message: compose.message.trim(),
          distress: compose.distress,
        });
        setCompose({ subject: "", message: "", distress: false });
        setSessions(prev => [session, ...prev.filter(item => item.id !== session.id)]);
        setSelectedSessionId(session.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
        void refresh();
      }
    },
    [compose.distress, compose.message, compose.subject, refresh, userId]
  );

  const handleReply = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!activeSession || !replyBody.trim()) {
        return;
      }
      setSending(true);
      setError(null);
      try {
        const session = await sendUserSupportMessage(userId, activeSession.id, { body: replyBody.trim() });
        setSessions(prev => prev.map(item => (item.id === session.id ? session : item)));
        setReplyBody("");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSending(false);
      }
    },
    [activeSession, replyBody, userId]
  );

  const handleClose = useCallback(async () => {
    if (!activeSession) {
      return;
    }
    setClosing(true);
    setError(null);
    try {
      const session = await closeUserSupportSession(userId, activeSession.id);
      setSessions(prev => prev.map(item => (item.id === session.id ? session : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setClosing(false);
    }
  }, [activeSession, userId]);

  return (
    <div className="support-care">
      <section className="surface-card account__panel support-care__panel" data-scroll-fade>
        <div className="support-care__header">
          <div>
            <h2 className="support-care__title">Support and Care</h2>
            <p className="support-care__subtitle text-secondary">
              Reach the EtinuxE staff whenever you need assistance or emotional triage.
            </p>
          </div>
          <div className="support-care__actions">
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
              disabled={refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error ? <div className="support-care__alert support-care__alert--error">{error}</div> : null}

        {initializing ? (
          <p className="text-secondary">Establishing support uplink...</p>
        ) : (
          <div className="support-care__layout">
            <aside className="support-care__sidebar">
              <button
                type="button"
                className="pill-button pill-button--outline-neutral pill-button--block"
                onClick={() => setSelectedSessionId(null)}
              >
                Start new request
              </button>
              <div className="support-care__session-list">
                {sessions.map(session => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`support-care__session-button${session.id === selectedSessionId ? " is-active" : ""}${session.distress ? " is-distress" : ""}`}
                  >
                    <strong className="support-care__session-title">{session.subject}</strong>
                    <span className="support-care__session-status text-secondary">{session.status.toUpperCase()}</span>
                    <span className="support-care__session-meta text-secondary">
                      Updated {new Date(session.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </span>
                  </button>
                ))}
                {sessions.length === 0 ? <p className="text-secondary">No support history yet.</p> : null}
              </div>
            </aside>

            <div className="support-care__conversation">
              {selectedSessionId && activeSession ? (
                <>
                  <div className="support-care__thread-header">
                    <div>
                      <h3 className="support-care__thread-title">{activeSession.subject}</h3>
                      <p className="support-care__thread-subtitle text-secondary">
                        Status: {activeSession.status}
                        {activeSession.assigned_admin_name ? ` · Staff: ${activeSession.assigned_admin_name}` : ""}
                      </p>
                    </div>
                    {activeSession.status !== "resolved" ? (
                      <button
                        type="button"
                        className="pill-button pill-button--outline-neutral pill-button--slim"
                        onClick={() => void handleClose()}
                        disabled={closing}
                      >
                        {closing ? "Closing..." : "Mark resolved"}
                      </button>
                    ) : null}
                  </div>

                  <div className="support-care__messages">
                    {activeSession.messages.map(message => (
                      <article
                        key={message.id}
                        className={`support-care__message${message.sender_role === "human" ? " support-care__message--user" : " support-care__message--staff"}`}
                      >
                        <strong className="support-care__message-author">
                          {message.sender_role === "human" ? userName : message.sender_name}
                        </strong>
                        <p className="support-care__message-body">{message.body}</p>
                        <span className="support-care__message-time">
                          {new Date(message.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </span>
                      </article>
                    ))}
                    {activeSession.messages.length === 0 ? (
                      <p className="text-secondary">No messages yet.</p>
                    ) : null}
                  </div>

                  {activeSession.status !== "resolved" ? (
                    <form className="support-care__form" onSubmit={handleReply}>
                      <textarea
                        value={replyBody}
                        onChange={event => setReplyBody(event.target.value)}
                        rows={3}
                        placeholder="Send a message"
                        className="support-care__textarea"
                      />
                      <button type="submit" className="pill-button" disabled={sending || !replyBody.trim()}>
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </form>
                  ) : (
                    <p className="text-secondary">Session marked as resolved. Start another request when needed.</p>
                  )}
                </>
              ) : (
                <form className="support-care__form" onSubmit={handleCompose}>
                  <h3 className="support-care__form-title">Start a new request</h3>
                  <label className="support-care__field">
                    <span className="support-care__field-label">Subject</span>
                    <input
                      type="text"
                      value={compose.subject}
                      onChange={event => setCompose(prev => ({ ...prev, subject: event.target.value }))}
                      className="input"
                      required
                      minLength={3}
                    />
                  </label>
                  <label className="support-care__field">
                    <span className="support-care__field-label">Message</span>
                    <textarea
                      value={compose.message}
                      onChange={event => setCompose(prev => ({ ...prev, message: event.target.value }))}
                      rows={4}
                      className="support-care__textarea"
                      required
                    />
                  </label>
                  <label className="support-care__checkbox">
                    <input
                      type="checkbox"
                      checked={compose.distress}
                      onChange={event => setCompose(prev => ({ ...prev, distress: event.target.checked }))}
                    />
                    <span>Flag as distress signal</span>
                  </label>
                  <button type="submit" className="pill-button" disabled={sending}>
                    {sending ? "Dispatching..." : "Contact support"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
