import { useEffect, useMemo, useRef, useState } from "react";

import {
  updateUserByAdmin,
  type AdminUserUpdatePayload,
  type MiniaturizationStage,
  type UserRecord,
} from "../api";
import { useAdminOverview } from "../hooks/useAdminOverview";

import "./admin-common.css";
import "./AdminUsers.css";
import "./AdminManage.css";

const STAGES: MiniaturizationStage[] = [
  "signup",
  "verified",
  "request_submitted",
  "payment_captured",
  "assessment_complete",
  "awaiting_procedure",
  "miniaturized",
];

const USER_STATUSES: UserRecord["status"][] = ["pending_verification", "verified"];

interface EditFormState {
  name: string;
  email: string;
  location: string;
  status: UserRecord["status"];
  current_stage: MiniaturizationStage;
  health_score: string;
}

const EMPTY_FORM: EditFormState = {
  name: "",
  email: "",
  location: "",
  status: USER_STATUSES[0],
  current_stage: STAGES[0],
  health_score: "",
};

export default function AdminUsers(): JSX.Element {
  const { overview, loading, error, refresh, setOverview } = useAdminOverview();
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [form, setForm] = useState<EditFormState>(EMPTY_FORM);
  const [state, setState] = useState<{ saving: boolean; message: string | null; error: string | null }>(
    { saving: false, message: null, error: null }
  );
  const formRef = useRef<HTMLFormElement | null>(null);

  const users = overview?.users ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return users;
    }
    return users.filter(user =>
      [user.name, user.email, user.location].some(field => field?.toLowerCase().includes(q))
    );
  }, [query, users]);

  useEffect(() => {
    if (!filtered.length) {
      setSelectedUserId(null);
      return;
    }
    if (!selectedUserId || !filtered.some(user => user.id === selectedUserId)) {
      setSelectedUserId(filtered[0].id);
    }
  }, [filtered, selectedUserId]);

  const selectedUser = useMemo(
    () => filtered.find(user => user.id === selectedUserId) ?? null,
    [filtered, selectedUserId]
  );

  useEffect(() => {
    if (!selectedUser) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      name: selectedUser.name,
      email: selectedUser.email,
      location: selectedUser.location ?? "",
      status: selectedUser.status,
      current_stage: selectedUser.current_stage,
      health_score: String(selectedUser.health_score ?? ""),
    });
    setState(prev => ({ ...prev, message: null, error: null }));
  }, [selectedUser]);

  const formatLabel = (value: string) =>
    value
      .split("_")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const handleChange = (key: keyof EditFormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    setState({ saving: true, message: null, error: null });
    const payload: AdminUserUpdatePayload = {
      name: form.name,
      email: form.email,
      location: form.location.trim() === "" ? null : form.location,
      status: form.status,
      current_stage: form.current_stage,
    };

    const trimmedScore = form.health_score.trim();
    if (trimmedScore.length > 0) {
      const score = Number(trimmedScore);
      if (!Number.isNaN(score)) {
        payload.health_score = score;
      }
    }

    try {
      const updated = await updateUserByAdmin(selectedUser.id, payload);
      setOverview(current => {
        if (!current) {
          return current;
        }
        return { ...current, users: current.users.map(user => (user.id === updated.id ? updated : user)) };
      });
      setState({ saving: false, message: "User updated successfully.", error: null });
    } catch (err) {
      setState({
        saving: false,
        message: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const resetForm = () => {
    if (!selectedUser) {
      return;
    }
    setForm({
      name: selectedUser.name,
      email: selectedUser.email,
      location: selectedUser.location ?? "",
      status: selectedUser.status,
      current_stage: selectedUser.current_stage,
      health_score: String(selectedUser.health_score ?? ""),
    });
    setState(prev => ({ ...prev, message: null, error: null }));
  };

  if (loading) {
    return <section className="surface-card admin-panel admin-users__panel">Reconstructing registry lattice…</section>;
  }

  if (error) {
    return (
      <section className="surface-card admin-panel admin-panel--error admin-users__panel">
        <p className="admin-users__error">{error}</p>
      </section>
    );
  }

  return (
    <section className="admin-users admin-page">
      <header className="admin-users__header admin-header">
        <div>
          <h1 className="admin-users__title admin-title">Human Registry</h1>
          <p className="text-secondary">
            {filtered.length} of {users.length} humans visible
          </p>
        </div>
        <div className="admin-users__actions admin-actions">
          <input
            type="search"
            className="search-input"
            placeholder="Search name, email, location"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <button type="button" onClick={() => void refresh()} className="pill-button pill-button--regular">
            Refresh
          </button>
          <button
            type="button"
            className="pill-button pill-button--ghost"
            disabled={!selectedUser}
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            Edit selected user
          </button>
          <a className="pill-button pill-button--ghost" href="/admin/admins/create">
            Create admin
          </a>
        </div>
      </header>

      <section className="surface-card admin-panel admin-users__panel">
        <table className="admin-users__table admin-table">
          <thead>
            <tr className="admin-users__table-head admin-table-head">
              <th>Name</th>
              <th>Email</th>
              <th>Stage</th>
              <th>Location</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <tr
                key={user.id}
                className={`admin-users__row admin-table-row admin-table-row--selectable ${selectedUser?.id === user.id ? "admin-table-row--selected" : ""}`}
                onClick={() => setSelectedUserId(user.id)}
              >
                <td className="admin-users__cell admin-table-cell">{user.name}</td>
                <td className="admin-users__cell admin-table-cell">{user.email}</td>
                <td className="admin-users__cell admin-table-cell">{formatLabel(user.current_stage)}</td>
                <td className="admin-users__cell admin-table-cell">{user.location || "—"}</td>
                <td className="admin-users__cell admin-table-cell">{new Date(user.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-secondary">No humans match the current query.</p>}
      </section>

      <section className="surface-card admin-panel">
        <div>
          <h2 className="admin-section-title">Update selected user</h2>
          <p className="admin-section-subtitle">Changes sync instantly to the registry.</p>
        </div>
        {selectedUser ? (
          <form className="admin-manage__form" onSubmit={handleSubmit} ref={formRef}>
            <div className="admin-manage__row">
              <label className="admin-manage__field">
                <span className="admin-label">Name</span>
                <input className="input" value={form.name} onChange={event => handleChange("name", event.target.value)} required />
              </label>
              <label className="admin-manage__field">
                <span className="admin-label">Email</span>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={event => handleChange("email", event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="admin-manage__row">
              <label className="admin-manage__field">
                <span className="admin-label">Location</span>
                <input
                  className="input"
                  value={form.location}
                  placeholder="Optional"
                  onChange={event => handleChange("location", event.target.value)}
                />
              </label>
              <label className="admin-manage__field">
                <span className="admin-label">Account status</span>
                <select className="input" value={form.status} onChange={event => handleChange("status", event.target.value)}>
                  {USER_STATUSES.map(status => (
                    <option key={status} value={status}>
                      {formatLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-manage__row">
              <label className="admin-manage__field">
                <span className="admin-label">Journey stage</span>
                <select
                  className="input"
                  value={form.current_stage}
                  onChange={event => handleChange("current_stage", event.target.value)}
                >
                  {STAGES.map(stage => (
                    <option key={stage} value={stage}>
                      {formatLabel(stage)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-manage__field">
                <span className="admin-label">Health score</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={form.health_score}
                  onChange={event => handleChange("health_score", event.target.value)}
                />
              </label>
            </div>
            <div className="admin-manage__actions">
              <button type="button" className="pill-button pill-button--ghost" onClick={resetForm} disabled={state.saving}>
                Reset
              </button>
              <button type="submit" className="pill-button pill-button--regular" disabled={state.saving}>
                {state.saving ? "Saving…" : "Save changes"}
              </button>
            </div>
            {state.message && <p className="admin-manage__feedback admin-manage__feedback--success">{state.message}</p>}
            {state.error && <p className="admin-manage__feedback admin-manage__feedback--error">{state.error}</p>}
          </form>
        ) : (
          <p className="text-secondary">Select a user from the table above to edit their record.</p>
        )}
      </section>
    </section>
  );
}
