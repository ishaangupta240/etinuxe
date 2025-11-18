import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchUserOverview,
  MiniaturizationStatus,
  updateRequestHealthRating,
  UserOverview,
} from "../api";
import { useAdminOverview } from "../hooks/useAdminOverview";
import { UserOverviewModal } from "../components/UserOverviewModal";

import "./admin-common.css";
import "./AdminRequests.css";

const statusOptions: Array<"all" | MiniaturizationStatus> = [
  "all",
  "draft",
  "awaiting_approval",
  "approved",
  "rejected",
  "completed",
];

export default function AdminRequests(): JSX.Element {
  const { overview, loading, error, refresh, setOverview } = useAdminOverview();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | MiniaturizationStatus>("all");
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [ratingDraft, setRatingDraft] = useState<string>("");
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingFeedback, setRatingFeedback] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userOverview, setUserOverview] = useState<UserOverview | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userRefreshCounter, setUserRefreshCounter] = useState(0);

  const requests = overview?.requests ?? [];
  const userNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (overview?.users ?? []).forEach(user => {
      map[user.id] = user.name;
    });
    return map;
  }, [overview?.users]);
  const getUserName = (userId: string) => userNameMap[userId] ?? `${userId.slice(0, 10)}…`;
  const selectedRequest = useMemo(
    () => requests.find(request => request.id === selectedRequestId) ?? null,
    [requests, selectedRequestId]
  );
  const selectedUserId = selectedRequest?.user_id ?? null;
  const selectedUserName = selectedUserId ? userNameMap[selectedUserId] : null;
  const ratingLocked = selectedRequest?.status === "completed";
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter(request => {
      if (status !== "all" && request.status !== status) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        request.id.toLowerCase().includes(q) ||
        request.user_id.toLowerCase().includes(q)
      );
    });
  }, [query, requests, status]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedRequestId(null);
      return;
    }
    if (!selectedRequestId || !filtered.some(request => request.id === selectedRequestId)) {
      setSelectedRequestId(filtered[0].id);
    }
  }, [filtered, selectedRequestId]);

  useEffect(() => {
    setRatingError(null);
    setRatingFeedback(null);
    if (!selectedRequest) {
      setRatingDraft("");
      return;
    }
    setRatingDraft(
      selectedRequest.staff_health_rating != null ? String(selectedRequest.staff_health_rating) : ""
    );
  }, [selectedRequest]);

  useEffect(() => {
    if (!selectedUserId) {
      setUserOverview(null);
      setUserError(null);
      setUserLoading(false);
      return;
    }
    let cancelled = false;
    setUserLoading(true);
    setUserError(null);
    fetchUserOverview(selectedUserId)
      .then(data => {
        if (!cancelled) {
          setUserOverview(data);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setUserError(err instanceof Error ? err.message : String(err));
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
  }, [selectedUserId, userRefreshCounter]);

  const handleSaveRating = useCallback(async () => {
    if (!selectedRequest) {
      return;
    }
    if (selectedRequest.status === "completed") {
      setRatingError("Completed requests cannot be updated.");
      return;
    }
    const parsed = Number(ratingDraft);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      setRatingError("Enter a rating between 0 and 100.");
      return;
    }
    if (parsed < 0 || parsed > 100) {
      setRatingError("Rating must be between 0 and 100.");
      return;
    }

    setRatingSaving(true);
    setRatingError(null);
    setRatingFeedback(null);
    try {
      const response = await updateRequestHealthRating(selectedRequest.id, parsed);
      setOverview(prev => {
        if (!prev) {
          return prev;
        }
        const updatedRequests = prev.requests.map(item =>
          item.id === response.request.id ? response.request : item
        );
        const updatedUsers = prev.users.map(user => (user.id === response.user.id ? response.user : user));
        let updatedDnaProfiles = prev.dna_profiles;
        if (response.dna_profile) {
          const remaining = prev.dna_profiles.filter(profile => profile.user_id !== response.user.id);
          updatedDnaProfiles = [...remaining, response.dna_profile];
        }
        const bucketKeys = Object.keys(prev.summary.health_bucket_distribution);
        const nextBucketCounts: Record<string, number> = {};
        bucketKeys.forEach(key => {
          nextBucketCounts[key] = 0;
        });
        updatedDnaProfiles.forEach(profile => {
          const key = profile.health_bucket;
          nextBucketCounts[key] = (nextBucketCounts[key] ?? 0) + 1;
        });
        const avgHealth =
          updatedDnaProfiles.length === 0
            ? prev.summary.avg_health_score
            : Number(
                (
                  updatedDnaProfiles.reduce((sum, profile) => sum + profile.health_score, 0) /
                  updatedDnaProfiles.length
                ).toFixed(3)
              );
        return {
          ...prev,
          requests: updatedRequests,
          users: updatedUsers,
          dna_profiles: updatedDnaProfiles,
          summary: {
            ...prev.summary,
            avg_health_score: avgHealth,
            health_bucket_distribution: nextBucketCounts,
          },
        };
      });
      setRatingFeedback("Health rating saved.");
      setRatingDraft(response.request.staff_health_rating != null ? String(response.request.staff_health_rating) : "");
      setUserRefreshCounter(counter => counter + 1);
    } catch (err) {
      setRatingError(err instanceof Error ? err.message : String(err));
    } finally {
      setRatingSaving(false);
    }
  }, [ratingDraft, selectedRequest, setOverview]);

  if (loading) {
    return <section className="surface-card admin-panel text-secondary">Synchronizing request queue...</section>;
  }

  if (error) {
    return (
      <section className="surface-card admin-panel admin-panel--error">
        <p className="admin-requests__message">{error}</p>
      </section>
    );
  }

  return (
    <section className="admin-requests admin-page">
      <header className="admin-requests__header admin-header">
        <div>
          <h1 className="admin-title">Miniaturization Requests</h1>
          <p className="text-secondary">{filtered.length} matching entries</p>
        </div>
        <div className="admin-actions admin-requests__actions">
          <input
            type="search"
            placeholder="Filter by request or user ID"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="search-input"
          />
          <button type="button" className="pill-button pill-button--regular" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      <div className="admin-requests__status">
        {statusOptions.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => setStatus(option)}
            className={`admin-requests__chip${status === option ? " is-active" : ""}`}
          >
            {option.replace("_", " ").toUpperCase()}
          </button>
        ))}
      </div>

      <div className="admin-requests__layout">
        <section className="surface-card admin-panel admin-requests__grid-panel">
          <header className="admin-header admin-requests__panel-header">
            <h2 className="admin-section-title">Request list</h2>
            <span className="text-secondary">{requests.length} total</span>
          </header>
          {filtered.length === 0 ? (
            <p className="admin-empty">No requests match the current filters.</p>
          ) : (
            <div className="admin-card-grid admin-requests__grid">
              {filtered.map(request => {
                const isSelected = request.id === selectedRequestId;
                return (
                  <article
                    key={request.id}
                    className={`admin-request-card${isSelected ? " admin-request-card--selected" : ""}`}
                    onClick={() => setSelectedRequestId(request.id)}
                  >
                    <div className="admin-request-card__header">
                      <div>
                        <p className="admin-inline-meta">Request</p>
                        <strong className="admin-request-card__title">{request.id.slice(0, 10)}…</strong>
                      </div>
                      <span className={`admin-status-chip admin-status-chip--${request.status.replace(/_/g, "-")}`}>
                        {request.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="admin-inline-meta" title={request.user_id}>
                      User {getUserName(request.user_id)} · Scale {request.scale.toFixed(3)}x
                    </p>
                    <p className="admin-inline-meta">
                      Health rating {request.staff_health_rating != null ? `${request.staff_health_rating}/100` : "--"}
                    </p>
                    <p className="admin-inline-meta">
                      Submitted {new Date(request.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </p>
                    <div className="admin-request-card__actions">
                      <button
                        type="button"
                        className="pill-button pill-button--ghost"
                        onClick={event => {
                          event.stopPropagation();
                          setSelectedRequestId(request.id);
                          setUserModalOpen(true);
                        }}
                      >
                        View profile
                      </button>
                      <button
                        type="button"
                        className="pill-button pill-button--regular"
                        onClick={event => {
                          event.stopPropagation();
                          setSelectedRequestId(request.id);
                          if (typeof window !== "undefined") {
                            window.document.getElementById("admin-request-editor")?.scrollIntoView({ behavior: "smooth" });
                          }
                        }}
                      >
                        Edit rating
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <aside className="surface-card admin-panel admin-requests__inspector" id="admin-request-editor">
          {selectedRequest ? (
            <div className="admin-requests__inspector-content">
              <header className="admin-header admin-requests__inspector-header">
                <div>
                  <h2 className="admin-section-title">Request review</h2>
                  <p className="admin-requests__meta-note text-secondary">
                    {selectedRequest.id.slice(0, 12)}… · user {selectedUserName ?? `${selectedRequest.user_id.slice(0, 12)}…`}
                  </p>
                  <p className="admin-requests__meta-note text-secondary">
                    Submitted {new Date(selectedRequest.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUserModalOpen(true)}
                  className="pill-button pill-button--outline-neutral"
                  disabled={!selectedUserId || userLoading || !!userError}
                >
                  {userLoading ? "Loading…" : "View profile"}
                </button>
              </header>

              <div className="admin-requests__meta">
                <span className="admin-label">Status</span>
                <strong>{selectedRequest.status.replace(/_/g, " ")}</strong>
                {selectedRequest.staff_health_rating != null ? (
                  <span className="admin-inline-meta">
                    Last staff rating {selectedRequest.staff_health_rating}/100
                    {selectedRequest.staff_health_rating_at &&
                      ` · updated ${new Date(selectedRequest.staff_health_rating_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`}
                  </span>
                ) : ratingLocked ? (
                  <span className="admin-inline-meta">Completed without a staff rating.</span>
                ) : (
                  <span className="admin-inline-meta">No staff rating recorded yet.</span>
                )}
                {userError && !userLoading && (
                  <p className="admin-requests__message text-danger">Failed to load profile: {userError}</p>
                )}
              </div>

              <div className="admin-requests__section">
                <label className="admin-requests__field">
                  <span className="admin-label">Staff health rating (0-100)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={ratingDraft}
                    onChange={event => {
                      setRatingDraft(event.target.value);
                      setRatingFeedback(null);
                      setRatingError(null);
                    }}
                    placeholder={ratingLocked ? "Completed requests are locked" : "Enter rating"}
                    className="input input--compact"
                    disabled={ratingLocked || ratingSaving}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleSaveRating()}
                  className="pill-button pill-button--regular"
                  disabled={
                    ratingLocked ||
                    ratingSaving ||
                    ratingDraft.trim().length === 0
                  }
                >
                  {ratingSaving ? "Saving…" : "Save rating"}
                </button>
                {ratingLocked && <p className="admin-requests__message text-secondary">Completed requests cannot be updated.</p>}
                {ratingError && <p className="admin-requests__message text-danger">{ratingError}</p>}
                {ratingFeedback && <p className="admin-requests__message text-success">{ratingFeedback}</p>}
              </div>

            </div>
          ) : (
            <p className="admin-empty">Select a request to review and assign a health rating.</p>
          )}
        </aside>
      </div>
      <UserOverviewModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        overview={userOverview}
        loading={userLoading}
        error={userError}
      />
    </section>
  );
}
