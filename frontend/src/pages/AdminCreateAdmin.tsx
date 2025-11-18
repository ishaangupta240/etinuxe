import { useState } from "react";

import { createAdminAccount } from "../api";

import "./admin-common.css";
import "./AdminManage.css";

interface FormState {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  password: "",
  confirm: "",
};

export default function AdminCreateAdmin(): JSX.Element {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [state, setState] = useState<{ creating: boolean; message: string | null; error: string | null }>(
    { creating: false, message: null, error: null }
  );
  const [lastAdminEmail, setLastAdminEmail] = useState<string | null>(null);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.password.trim().length < 8) {
      setState({ creating: false, message: null, error: "Password must be at least 8 characters." });
      return;
    }
    if (form.password !== form.confirm) {
      setState({ creating: false, message: null, error: "Passwords do not match." });
      return;
    }

    setState({ creating: true, message: null, error: null });
    try {
      const admin = await createAdminAccount({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setLastAdminEmail(admin.email);
      setState({ creating: false, message: `Admin ${admin.name} created successfully.`, error: null });
      setForm(EMPTY_FORM);
    } catch (err) {
      setState({
        creating: false,
        message: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <section className="admin-page admin-manage-page">
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Create admin identity</h1>
          <p className="text-secondary">Provision secure access for new stewards.</p>
        </div>
      </header>

      <section className="surface-card admin-panel">
        <div>
          <h2 className="admin-section-title">Account blueprint</h2>
          <p className="admin-section-subtitle">Credentials sync instantly to the command deck.</p>
        </div>
        <form className="admin-manage__form" onSubmit={handleSubmit}>
          <div className="admin-manage__row">
            <label className="admin-manage__field">
              <span className="admin-label">Name</span>
              <input
                className="input"
                value={form.name}
                onChange={event => handleChange("name", event.target.value)}
                required
              />
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
              <span className="admin-label">Password</span>
              <input
                className="input"
                type="password"
                value={form.password}
                minLength={8}
                onChange={event => handleChange("password", event.target.value)}
                required
              />
            </label>
            <label className="admin-manage__field">
              <span className="admin-label">Confirm password</span>
              <input
                className="input"
                type="password"
                value={form.confirm}
                minLength={8}
                onChange={event => handleChange("confirm", event.target.value)}
                required
              />
            </label>
          </div>
          <div className="admin-manage__actions">
            <button
              type="submit"
              className="pill-button pill-button--regular"
              disabled={state.creating}
            >
              {state.creating ? "Creating…" : "Create account"}
            </button>
          </div>
          {state.message && <p className="admin-manage__feedback admin-manage__feedback--success">{state.message}</p>}
          {state.error && <p className="admin-manage__feedback admin-manage__feedback--error">{state.error}</p>}
          {lastAdminEmail && !state.creating && (
            <p className="text-secondary">Send onboarding details to <strong>{lastAdminEmail}</strong>.</p>
          )}
        </form>
      </section>
    </section>
  );
}
