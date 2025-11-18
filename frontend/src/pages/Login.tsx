import { FormEvent, useCallback, useEffect, useState } from "react";

import { loginAccount, requestPasswordReset, resetPassword } from "../api";

import "./Login.css";

type LoginProps = {
  role: "guest" | "human" | "admin";
  onHumanLogin: (payload: { userId: string; email: string; name: string }) => void;
  onAdminLogin: (admin: { id: string; email: string; name: string }) => void;
  onNavigate: (path: string) => void;
};

export default function Login({ role, onHumanLogin, onAdminLogin, onNavigate }: LoginProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [view, setView] = useState<"login" | "forgot">("login");
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [requestEmail, setRequestEmail] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [resetForm, setResetForm] = useState({ token: "", newPassword: "", confirmPassword: "" });
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "guest" && view !== "login") {
      setView("login");
    }
  }, [role, view]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setBusy(true);
      try {
        const email = form.email.trim();
        const password = form.password;
        if (!email || !password) {
          throw new Error("Enter both email and password.");
        }
        const result = await loginAccount({ email, password });
        if (result.role === "human") {
          onHumanLogin({
            userId: result.user.id,
            email: result.user.email,
            name: result.user.name,
          });
        } else {
          onAdminLogin(result.admin);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [form.email, form.password, onAdminLogin, onHumanLogin]
  );

  const handleShowForgot = useCallback(() => {
    setView("forgot");
    setError(null);
    setLoginNotice(null);
    setResetError(null);
    setRequestMessage(null);
    setRequestEmail(form.email.trim());
    setResetForm({ token: "", newPassword: "", confirmPassword: "" });
  }, [form.email]);

  const handleReturnToLogin = useCallback(() => {
    setView("login");
    setResetError(null);
    setRequestMessage(null);
    if (requestEmail) {
      setForm(prev => ({ ...prev, email: requestEmail }));
    }
  }, [requestEmail]);

  const handleRequestReset = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setRequestBusy(true);
      setResetError(null);
      setRequestMessage(null);
      try {
        const email = requestEmail.trim();
        if (!email) {
          throw new Error("Provide the email linked to your account.");
        }
        await requestPasswordReset({ email });
        setRequestMessage(
          "If that email is registered, a recovery message has been sent. Check your inbox and follow the instructions inside."
        );
      } catch (err) {
        setResetError(err instanceof Error ? err.message : String(err));
      } finally {
        setRequestBusy(false);
      }
    },
    [requestEmail]
  );

  const handleResetSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setResetBusy(true);
      setResetError(null);
      try {
        const token = resetForm.token.trim();
        if (!token) {
          throw new Error("Enter the token you received via email.");
        }
        if (!resetForm.newPassword || resetForm.newPassword.length < 8) {
          throw new Error("Choose a new password with at least 8 characters.");
        }
        if (resetForm.newPassword !== resetForm.confirmPassword) {
          throw new Error("Confirmation does not match your new password.");
        }
        await resetPassword({ token, newPassword: resetForm.newPassword });
        setLoginNotice("Password updated. You can sign in with the new credentials now.");
        setForm(prev => ({ ...prev, password: "" }));
        setView("login");
      } catch (err) {
        setResetError(err instanceof Error ? err.message : String(err));
      } finally {
        setResetBusy(false);
      }
    },
    [resetForm.confirmPassword, resetForm.newPassword, resetForm.token]
  );

  if (role === "human") {
    return (
      <section className="login">
        <div className="surface-card login__card">
          <h2 className="login__title">Already signed in</h2>
          <p className="login__description text-secondary">
            You are authenticated as an onboarding candidate. Visit your account console or return home.
          </p>
          <div className="login__actions">
            <button type="button" className="pill-button" onClick={() => onNavigate("/account")}>
              Go to My Account
            </button>
            <button
              type="button"
              className="pill-button pill-button--outline-neutral pill-button--slim"
              onClick={() => onNavigate("/")}
            >
              Return Home
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (role === "admin") {
    return (
      <section className="login">
        <div className="surface-card login__card">
          <h2 className="login__title">Administrator active</h2>
          <p className="login__description text-secondary">
            An administrator session is already active. Proceed to the command deck or Marova vault oversight console.
          </p>
          <div className="login__actions">
            <button type="button" className="pill-button" onClick={() => onNavigate("/admin")}>
              Open Admin Deck
            </button>
            <button
              type="button"
              className="pill-button pill-button--outline-neutral pill-button--slim"
              onClick={() => onNavigate("/admin/marova")}
            >
              View Marova Vault
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (view === "forgot") {
    return (
      <section className="login login--wide">
        <div className="surface-card login__card">
          <div className="login__card-header">
            <div>
              <h2 className="login__title">Recover access</h2>
              <p className="login__description text-secondary">
                Generate a password reset token and apply it to set a new credential. Administrators and human candidates use the
                same recovery flow.
              </p>
            </div>
            <button
              type="button"
              className="pill-button pill-button--outline-neutral pill-button--slim"
              onClick={handleReturnToLogin}
            >
              Back to login
            </button>
          </div>

          {resetError ? <div className="login__error">{resetError}</div> : null}

          {requestMessage ? <div className="login__hint">{requestMessage}</div> : null}

          <form className="login__form" onSubmit={handleRequestReset}>
            <h3 className="login__subtitle">Step 1 · Request reset token</h3>
            <label className="login__field">
              <span className="login__field-label">Email</span>
              <input
                className="input login__input"
                type="email"
                autoComplete="email"
                value={requestEmail}
                onChange={event => setRequestEmail(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="pill-button" disabled={requestBusy}>
              {requestBusy ? "Sending..." : "Send recovery token"}
            </button>
          </form>

          <form className="login__form" onSubmit={handleResetSubmit} autoComplete="off">
            <h3 className="login__subtitle">Step 2 · Apply token</h3>
            <label className="login__field">
              <span className="login__field-label">Token</span>
              <input
                className="input login__input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={resetForm.token}
                onChange={event => setResetForm(prev => ({ ...prev, token: event.target.value }))}
                required
              />
            </label>
            <label className="login__field">
              <span className="login__field-label">New password</span>
              <input
                className="input login__input"
                type="password"
                autoComplete="new-password"
                value={resetForm.newPassword}
                onChange={event => setResetForm(prev => ({ ...prev, newPassword: event.target.value }))}
                required
                minLength={8}
              />
            </label>
            <label className="login__field">
              <span className="login__field-label">Confirm password</span>
              <input
                className="input login__input"
                type="password"
                autoComplete="new-password"
                value={resetForm.confirmPassword}
                onChange={event => setResetForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                required
                minLength={8}
              />
            </label>
            <button type="submit" className="pill-button" disabled={resetBusy}>
              {resetBusy ? "Resetting..." : "Update password"}
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section className="login">
      <div className="surface-card login__card">
        <div>
          <h2 className="login__title">Sign in to the Vault</h2>
          <p className="login__description text-secondary">
            Use your registered email and password to access onboarding dossiers or command utilities. Administrators share this
            portal.
          </p>
        </div>

        

        {loginNotice ? <div className="login__status">{loginNotice}</div> : null}

        {error ? <div className="login__error">{error}</div> : null}

        <form className="login__form" onSubmit={handleSubmit}>
          <label className="login__field">
            <span className="login__field-label">Email</span>
            <input
              className="input login__input"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label className="login__field">
            <span className="login__field-label">Password</span>
            <input
              className="input login__input"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))}
              required
              minLength={8}
            />
          </label>
          <button type="button" className="login__link" onClick={handleShowForgot}>
            Forgot password?
          </button>
          <button type="submit" className="pill-button" disabled={busy}>
            {busy ? "Processing..." : "Authenticate"}
          </button>
        </form>
      </div>
    </section>
  );
}
