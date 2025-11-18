import { useCallback, useEffect, useMemo, useState } from "react";

import {
  activateInsurancePolicy,
  fetchUserOverview,
  InsurancePolicyQuote,
  InsurancePolicyRecord,
  InsurancePolicySelectionPayload,
  InsuranceTier,
  MiniaturizationRequestRecord,
  previewInsurancePolicy,
  UserOverview,
} from "../api";

import "./Account.css";
import "./InsuranceEnrollment.css";

type InsuranceEnrollmentProps = {
  userId: string;
  onNavigate: (path: string) => void;
};

const insuranceTierOptions: InsuranceTier[] = ["basic", "plus", "premium", "ultra"];
const insuranceTierLabels: Record<InsuranceTier, string> = {
  basic: "Basic",
  plus: "Plus",
  premium: "Premium",
  ultra: "Ultra",
};

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function formatScale(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "0";
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }
  if (Math.abs(value) >= 0.01) {
    return value.toFixed(3);
  }
  return Number.parseFloat(value.toPrecision(3)).toString();
}

export default function InsuranceEnrollment({ userId, onNavigate }: InsuranceEnrollmentProps): JSX.Element {
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<InsuranceTier>("basic");
  const [quote, setQuote] = useState<InsurancePolicyQuote | null>(null);
  const [quoteEligible, setQuoteEligible] = useState<boolean>(false);
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const [activePolicyTier, setActivePolicyTier] = useState<InsuranceTier | null>(null);
  const [activationMode, setActivationMode] = useState<"immediate" | "scheduled" | null>(null);
  const [effectiveAt, setEffectiveAt] = useState<string | null>(null);
  const [scheduledPolicyTier, setScheduledPolicyTier] = useState<InsuranceTier | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [activationSaving, setActivationSaving] = useState(false);
  const [activationFeedback, setActivationFeedback] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
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
    void loadOverview();
  }, [loadOverview]);

  const policiesByRequest = useMemo(() => {
    const mapping = new Map<string, InsurancePolicyRecord>();
    const policies = overview?.insurance_policies ?? [];
    for (const policy of policies) {
      if (policy.status === "active") {
        mapping.set(policy.request_id, policy);
      }
    }
    return mapping;
  }, [overview?.insurance_policies]);

  const scheduledPoliciesByRequest = useMemo(() => {
    const mapping = new Map<string, InsurancePolicyRecord>();
    const policies = overview?.insurance_policies ?? [];
    for (const policy of policies) {
      if (policy.status === "scheduled") {
        mapping.set(policy.request_id, policy);
      }
    }
    return mapping;
  }, [overview?.insurance_policies]);

  const eligibleRequests = useMemo(() => {
    const requests = overview?.requests ?? [];
    return requests.filter(request => {
      const statusEligible = request.status === "approved" || request.status === "completed";
      return statusEligible;
    });
  }, [overview?.requests]);

  useEffect(() => {
    if (eligibleRequests.length === 0) {
      setSelectedRequestId("");
      return;
    }
    setSelectedRequestId(prev => {
      if (prev && eligibleRequests.some(request => request.id === prev)) {
        return prev;
      }
      return eligibleRequests[0].id;
    });
  }, [eligibleRequests]);

  useEffect(() => {
    if (!selectedRequestId) {
      setSelectedTier("basic");
      setActivePolicyTier(null);
      return;
    }
    const activePolicy = policiesByRequest.get(selectedRequestId);
    if (activePolicy) {
      setSelectedTier(activePolicy.tier);
      setActivePolicyTier(activePolicy.tier);
    } else {
      setSelectedTier("basic");
      setActivePolicyTier(null);
    }
  }, [policiesByRequest, selectedRequestId]);

  useEffect(() => {
    if (!selectedRequestId) {
      setQuote(null);
      setQuoteEligible(false);
      setQuoteStatus(null);
      setActivePolicyTier(null);
      setActivationMode(null);
      setEffectiveAt(null);
      setScheduledPolicyTier(null);
      return;
    }
    let cancelled = false;
    const payload: InsurancePolicySelectionPayload = { request_id: selectedRequestId, tier: selectedTier };
    setPreviewLoading(true);
    setPreviewError(null);
    previewInsurancePolicy(userId, payload)
      .then(response => {
        if (cancelled) {
          return;
        }
        setQuote(response.quote);
        setQuoteEligible(response.eligible);
        setQuoteStatus(response.request_status);
        setActivePolicyTier(response.active_policy_tier ?? null);
        setActivationMode(response.activation_mode ?? null);
        setEffectiveAt(response.effective_at ?? null);
        setScheduledPolicyTier(response.scheduled_policy_tier ?? null);
      })
      .catch(err => {
        if (cancelled) {
          return;
        }
        setQuote(null);
        setQuoteEligible(false);
        setQuoteStatus(null);
        setActivePolicyTier(null);
        setActivationMode(null);
        setEffectiveAt(null);
        setScheduledPolicyTier(null);
        setPreviewError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRequestId, selectedTier, userId]);

  const activePolicies = useMemo(() => {
    return (overview?.insurance_policies ?? []).filter(policy => policy.status === "active");
  }, [overview?.insurance_policies]);

  const scheduledPolicies = useMemo(() => {
    return (overview?.insurance_policies ?? []).filter(policy => policy.status === "scheduled");
  }, [overview?.insurance_policies]);

  const allPolicies = overview?.insurance_policies ?? [];

  const handleActivate = useCallback(async () => {
    if (!selectedRequestId) {
      return;
    }
    const payload: InsurancePolicySelectionPayload = { request_id: selectedRequestId, tier: selectedTier };
    const previousTier = activePolicyTier;
    setActivationSaving(true);
    setActivationError(null);
    setActivationFeedback(null);
    try {
      const response = await activateInsurancePolicy(userId, payload);
      const responseTier = response.pricing.tier as InsuranceTier;
      const newTierLabel = insuranceTierLabels[responseTier] ?? response.pricing.tier;
      const previousTierLabel = previousTier ? insuranceTierLabels[previousTier] : null;
      const mode = response.activation_mode ?? "immediate";
      const effectiveLabel = response.effective_at ? formatDate(response.effective_at) : "your next billing date";
      let feedback: string;
      if (mode === "scheduled") {
        const coverageNote = previousTierLabel
          ? `${previousTierLabel} coverage stays active until then.`
          : "Current coverage stays active until then.";
        feedback = `${newTierLabel} coverage scheduled at ${formatCurrency(response.pricing.final_premium)} per month. It will begin on ${effectiveLabel}. ${coverageNote}`;
      } else {
        const transitionNote = previousTierLabel && previousTierLabel !== newTierLabel
          ? ` Replaced ${previousTierLabel} coverage.`
          : "";
        feedback = `${newTierLabel} coverage active at ${formatCurrency(response.pricing.final_premium)} per month.${transitionNote}`;
      }
      setActivationFeedback(feedback);
      setActivationMode(mode);
      setEffectiveAt(response.effective_at ?? null);
      setScheduledPolicyTier(mode === "scheduled" ? responseTier : null);
      await loadOverview();
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : String(err));
    } finally {
      setActivationSaving(false);
    }
  }, [activePolicyTier, loadOverview, selectedRequestId, selectedTier, userId]);

  const selectedRequest = useMemo<MiniaturizationRequestRecord | null>(() => {
    return (overview?.requests ?? []).find(request => request.id === selectedRequestId) ?? null;
  }, [overview?.requests, selectedRequestId]);

  useEffect(() => {
    setActivationFeedback(null);
    setActivationError(null);
  }, [selectedRequestId, selectedTier]);

  const sameTierActive = activePolicyTier !== null && quote?.tier === activePolicyTier;
  const sameTierScheduled = scheduledPolicyTier !== null && quote?.tier === scheduledPolicyTier;
  const infoMessage = useMemo(() => {
    if (!quote) {
      return null;
    }
    if (!quoteEligible) {
      return `Request status is ${quoteStatus?.replace(/_/g, " ") ?? "unavailable"}. Coverage activates once approval completes.`;
    }
    if (sameTierActive) {
      return "This tier is already active for the selected request.";
    }
    if (sameTierScheduled) {
      const scheduleLabel = effectiveAt ? formatDate(effectiveAt) : "your next billing date";
      return `This tier is already scheduled to begin on ${scheduleLabel}. No further action required.`;
    }
    if (activationMode === "scheduled") {
      const scheduleLabel = effectiveAt ? formatDate(effectiveAt) : "your next billing date";
      const currentLabel = activePolicyTier ? `${insuranceTierLabels[activePolicyTier]} coverage` : "Current coverage";
      const existingScheduleNote = scheduledPolicyTier && scheduledPolicyTier !== quote.tier
        ? ` This will replace your scheduled ${insuranceTierLabels[scheduledPolicyTier]} coverage.`
        : "";
      return `This change takes effect on your next billing date (${scheduleLabel}). ${currentLabel} stays active until then.${existingScheduleNote}`;
    }
    return "Activation will start coverage immediately.";
  }, [activationMode, activePolicyTier, effectiveAt, quote, quoteEligible, quoteStatus, sameTierActive, sameTierScheduled, scheduledPolicyTier]);

  const disableActivate =
    !selectedRequestId || !quote || !quoteEligible || activationSaving || previewLoading || sameTierActive || sameTierScheduled;

  return (
    <div className="insurance-enrollment">
      <header className="surface-card account__panel insurance-enrollment__header" data-scroll-fade>
        <div className="insurance-enrollment__header-row">
          <div>
            <h2 className="insurance-enrollment__title">Insurance Coverage</h2>
            <p className="insurance-enrollment__subtitle text-secondary">
              Secure your procedure with monthly coverage driven by your health tier and memory points.
            </p>
          </div>
          <div className="insurance-enrollment__actions">
            <button type="button" className="pill-button pill-button--outline-neutral pill-button--slim" onClick={() => onNavigate("/account")}>
              Back to account
            </button>
            <button type="button" className="pill-button" onClick={loadOverview} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        {error ? <div className="insurance-enrollment__notice insurance-enrollment__notice--error">{error}</div> : null}
      </header>

      <div className="insurance-enrollment__grid">
        <section className="surface-card account__panel insurance-enrollment__panel" data-scroll-fade>
          <div className="insurance-enrollment__panel-header">
            <h3 className="insurance-enrollment__panel-title">Active Coverage</h3>
            <p className="text-secondary">Review policies currently shielding your procedure.</p>
          </div>
          {activePolicies.length === 0 ? (
            <p className="text-secondary">No active policies yet.</p>
          ) : (
            <div className="insurance-enrollment__coverage-list">
              {activePolicies.map(policy => (
                <div key={policy.id} className="insurance-enrollment__coverage-card">
                  <strong>{insuranceTierLabels[policy.tier]} Coverage</strong>
                  <span className="insurance-enrollment__coverage-meta text-secondary">Request ID: {policy.request_id}</span>
                  <span>Monthly premium: {formatCurrency(policy.final_premium)}</span>
                  <span className="insurance-enrollment__coverage-meta text-secondary">Next billing: {formatDate(policy.next_billing_at)}</span>
                </div>
              ))}
            </div>
          )}

          {scheduledPolicies.length > 0 ? (
            <div className="insurance-enrollment__scheduled">
              <strong className="text-secondary">Upcoming changes</strong>
              <div className="insurance-enrollment__coverage-list">
                {scheduledPolicies.map(policy => (
                  <div key={policy.id} className="insurance-enrollment__coverage-card">
                    <strong>{insuranceTierLabels[policy.tier]} Coverage (scheduled)</strong>
                    <span className="insurance-enrollment__coverage-meta text-secondary">Request ID: {policy.request_id}</span>
                    <span>Monthly premium: {formatCurrency(policy.final_premium)}</span>
                    <span className="insurance-enrollment__coverage-meta text-secondary">Starts on: {formatDate(policy.effective_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="surface-card account__panel insurance-enrollment__panel" data-scroll-fade>
          <div className="insurance-enrollment__panel-header">
            <h3 className="insurance-enrollment__panel-title">Activate Coverage</h3>
            <p className="text-secondary">
              Preview monthly premiums for each tier and switch coverage as your procedure evolves. Activating a tier replaces any existing policy for that request.
            </p>
          </div>

          {eligibleRequests.length === 0 ? (
            <p className="text-secondary">
              No approved or completed requests are available for insurance. Once your request progresses, check back here.
            </p>
          ) : (
            <div className="insurance-enrollment__form">
              <label className="insurance-enrollment__field" htmlFor="insurance-request">
                <span className="insurance-enrollment__field-label">Eligible request</span>
                <select
                  id="insurance-request"
                  className="input insurance-enrollment__select"
                  value={selectedRequestId}
                  onChange={event => setSelectedRequestId(event.target.value)}
                >
                  {eligibleRequests.map(request => {
                    const base = `${request.id} · scale ${formatScale(request.scale)} · ${request.status.replace(/_/g, " ")}`;
                    const activeTier = policiesByRequest.get(request.id)?.tier;
                    const scheduledTier = scheduledPoliciesByRequest.get(request.id)?.tier;
                    const details = [base];
                    if (activeTier) {
                      details.push(`active: ${insuranceTierLabels[activeTier]}`);
                    }
                    if (scheduledTier) {
                      details.push(`scheduled: ${insuranceTierLabels[scheduledTier]}`);
                    }
                    return (
                      <option key={request.id} value={request.id}>
                        {details.join(" · ")}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="insurance-enrollment__field" htmlFor="insurance-tier">
                <span className="insurance-enrollment__field-label">Coverage tier</span>
                <select
                  id="insurance-tier"
                  className="input insurance-enrollment__select"
                  value={selectedTier}
                  onChange={event => setSelectedTier(event.target.value as InsuranceTier)}
                >
                  {insuranceTierOptions.map(tier => (
                    <option key={tier} value={tier}>
                      {insuranceTierLabels[tier]}
                    </option>
                  ))}
                </select>
                <span className="insurance-enrollment__select-note text-secondary">
                  Switching tiers schedules a change for your next billing cycle. Basic coverage remains included at all times.
                </span>
              </label>

              {selectedRequest ? (
                <div className="insurance-enrollment__selected-request">
                  <strong className="insurance-enrollment__selected-request-title">Selected procedure</strong>
                  <span className="text-secondary">
                    Scale {formatScale(selectedRequest.scale)} · {selectedRequest.status.replace(/_/g, " ")}
                  </span>
                </div>
              ) : null}

              {previewError ? (
                <div className="insurance-enrollment__notice insurance-enrollment__notice--error">{previewError}</div>
              ) : null}

              {quote ? (
                <div className="insurance-enrollment__quote-grid">
                  <div className="insurance-enrollment__quote-row">
                    <span>Monthly premium</span>
                    <strong>{formatCurrency(quote.monthly_premium)}</strong>
                  </div>
                  <div className="insurance-enrollment__quote-row">
                    <span>After memory points</span>
                    <strong>{formatCurrency(quote.final_premium)}</strong>
                  </div>
                  <div className="insurance-enrollment__quote-row">
                    <span>Points redeemed</span>
                    <strong>{quote.points_redeemed.toFixed(0)}</strong>
                  </div>
                  <div className="insurance-enrollment__quote-row">
                    <span>Points remaining</span>
                    <strong>{(quote.points_available - quote.points_redeemed).toFixed(0)}</strong>
                  </div>
                  {activationMode === "scheduled" && effectiveAt ? (
                    <div className="insurance-enrollment__quote-row">
                      <span>Scheduled start</span>
                      <strong>{formatDate(effectiveAt)}</strong>
                    </div>
                  ) : null}
                  {infoMessage ? (
                    <div className="insurance-enrollment__notice insurance-enrollment__notice--info">{infoMessage}</div>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                className="pill-button pill-button--center"
                onClick={handleActivate}
                disabled={disableActivate}
              >
                {activationSaving ? "Activating..." : "Activate insurance"}
              </button>

              {activationFeedback ? (
                <div className="insurance-enrollment__notice insurance-enrollment__notice--success">{activationFeedback}</div>
              ) : null}
              {activationError ? (
                <div className="insurance-enrollment__notice insurance-enrollment__notice--error">{activationError}</div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <section className="surface-card account__panel insurance-enrollment__panel" data-scroll-fade>
        <div className="insurance-enrollment__panel-header">
          <h3 className="insurance-enrollment__panel-title">Policy Ledger</h3>
          <p className="text-secondary">Historical policies, including cancelled coverage, remain archived below.</p>
        </div>
        {allPolicies.length === 0 ? (
          <p className="text-secondary">No policies recorded yet.</p>
        ) : (
          <div className="insurance-enrollment__table-wrapper">
            <table className="insurance-enrollment__table">
              <thead>
                <tr>
                  <th>Policy ID</th>
                  <th>Request</th>
                  <th>Tier</th>
                  <th>Premium</th>
                  <th>Status</th>
                  <th>Effective</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {allPolicies.map(policy => (
                  <tr key={policy.id}>
                    <td>{policy.id}</td>
                    <td>{policy.request_id}</td>
                    <td>{insuranceTierLabels[policy.tier]}</td>
                    <td>{formatCurrency(policy.final_premium)}</td>
                    <td className="insurance-enrollment__status">{policy.status.replace(/_/g, " ")}</td>
                    <td>{formatDate(policy.effective_at)}</td>
                    <td>{formatDate(policy.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
