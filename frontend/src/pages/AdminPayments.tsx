import { useMemo, useState } from "react";

import { useAdminOverview } from "../hooks/useAdminOverview";
import "./admin-common.css";
import "./AdminPayments.css";

export default function AdminPayments(): JSX.Element {
  const { overview, loading, error, refresh } = useAdminOverview();
  const [query, setQuery] = useState("");

  const payments = overview?.payments ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter(payment => {
      if (!q) {
        return true;
      }
      return (
        payment.id.toLowerCase().includes(q) ||
        payment.user_id.toLowerCase().includes(q) ||
        payment.request_id.toLowerCase().includes(q)
      );
    });
  }, [payments, query]);

  if (loading) {
    return <section className="surface-card admin-panel">Reconciling invoices…</section>;
  }

  if (error) {
    return (
      <section className="surface-card admin-panel admin-panel--error">
        <p className="admin-payments__message">{error}</p>
      </section>
    );
  }

  const total = filtered.reduce((sum, payment) => sum + payment.amount_usd, 0);

  return (
    <section className="admin-payments admin-page">
      <header className="admin-header admin-payments__header">
        <div>
          <h1 className="admin-title">Invoices & Payments</h1>
          <p className="text-secondary">
            {filtered.length} payments · ${total.toFixed(2)} total
          </p>
        </div>
        <div className="admin-actions admin-payments__actions">
          <input
            type="search"
            placeholder="Search payment, user, or request"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="search-input"
          />
          <button type="button" className="pill-button pill-button--regular" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </header>

      <section className="surface-card admin-panel admin-payments__grid-panel">
        {filtered.length === 0 ? (
          <p className="admin-empty">No payments match the current filters.</p>
        ) : (
          <div className="admin-card-grid admin-payments__grid">
            {filtered.map(payment => (
              <article key={payment.id} className="admin-payment-card">
                <div className="admin-payment-card__header">
                  <div>
                    <p className="admin-inline-meta">Payment</p>
                    <strong className="admin-payment-card__title">{payment.id.slice(0, 10)}…</strong>
                  </div>
                  <span className={`admin-status-chip admin-status-chip--${payment.status.replace(/_/g, "-")}`}>
                    {payment.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="admin-payment-card__meta">
                  <p className="admin-inline-meta" title={payment.user_id}>
                    User {payment.user_id.slice(0, 10)}…
                  </p>
                  <p className="admin-inline-meta" title={payment.request_id}>
                    Request {payment.request_id.slice(0, 10)}…
                  </p>
                </div>
                <div className="admin-payment-card__footer">
                  <div>
                    <span className="admin-label">Amount</span>
                    <p className="admin-payment-card__amount">
                      ${payment.amount_usd.toFixed(2)}
                      {payment.currency !== "USD" && <span className="admin-payment-card__currency"> {payment.currency}</span>}
                    </p>
                  </div>
                  <div>
                    <span className="admin-label">Recorded</span>
                    <p className="admin-inline-meta">
                      {new Date(payment.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
