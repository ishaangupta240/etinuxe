import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { SettingsRecord, updateSettings } from "../api";
import { useAdminOverview } from "../hooks/useAdminOverview";
import "./admin-common.css";
import "./AdminPricing.css";

const tierOrder = ["basic", "plus", "premium", "ultra"] as const;
const bucketOrder = ["good", "normal", "unhealthy", "extremely_unhealthy"] as const;


export default function AdminPricing(): JSX.Element {
  const { overview, loading, error, setOverview } = useAdminOverview();
  const [draft, setDraft] = useState<SettingsRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (overview?.settings) {
      setDraft(overview.settings);
    }
  }, [overview?.settings]);

  const changeField = useCallback(<K extends keyof SettingsRecord>(key: K, value: SettingsRecord[K]) => {
    setDraft(prev => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const changeInsuranceField = useCallback((key: (typeof tierOrder)[number], value: number) => {
    setDraft(prev => (prev ? { ...prev, insurance_pricing: { ...prev.insurance_pricing, [key]: value } } : prev));
  }, []);

  const changeBucketField = useCallback((key: (typeof bucketOrder)[number], value: number) => {
    setDraft(prev => (prev ? { ...prev, health_bucket_multipliers: { ...prev.health_bucket_multipliers, [key]: value } } : prev));
  }, []);

  const changePointsField = useCallback((key: keyof SettingsRecord["points_discount"], value: number) => {
    setDraft(prev => (prev ? { ...prev, points_discount: { ...prev.points_discount, [key]: value } } : prev));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!draft) {
        return;
      }
      setSaving(true);
      setLocalError(null);
      try {
        const updated = await updateSettings(draft);
        setOverview(prev => (prev ? { ...prev, settings: updated } : prev));
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [draft, setOverview]
  );

  const summary = useMemo(() => {
    if (!overview?.summary) {
      return null;
    }
    const { summary: totals } = overview;
    return `Avg revenue / user: $${(totals.total_revenue / Math.max(1, totals.total_users)).toFixed(2)}`;
  }, [overview]);

  if (loading || !draft) {
    return <section className="surface-card admin-panel">Loading pricing matrices…</section>;
  }

  const displayError = localError ?? error;
  const tierLabels: Record<(typeof tierOrder)[number], string> = {
    basic: "Basic",
    plus: "Plus",
    premium: "Premium",
    ultra: "Ultra",
  };
  const bucketLabels: Record<(typeof bucketOrder)[number], string> = {
    good: "Good",
    normal: "Normal",
    unhealthy: "Unhealthy",
    extremely_unhealthy: "Extremely unhealthy",
  };
  const pointsDiscount = draft.points_discount;

  return (
    <section className="admin-pricing admin-page">
      <header className="admin-header admin-pricing__header">
        <div>
          <h1 className="admin-title">Pricing Parameters</h1>
          <p className="text-secondary">
            Calibrate EtinuxE scaling economics. {summary ?? ""}
          </p>
        </div>
      </header>

      <section className="surface-card admin-panel admin-pricing__panel">
        {displayError && <p className="admin-pricing__alert admin-pricing__alert--error">{displayError}</p>}
        <form onSubmit={handleSubmit} className="admin-pricing__form">
          <div className="admin-pricing__card">
            <h2 className="admin-section-title">Scale controls</h2>
            <p className="admin-pricing__helper">Tune base miniaturization pricing and permitted scale window.</p>
            <div className="admin-pricing__grid">
              <PricingField
                label="Pricing per 0.01×"
                value={draft.pricing_per_step}
                step={0.5}
                min={0.01}
                onChange={value => changeField("pricing_per_step", value)}
              />
              <PricingField label="Scale minimum" value={draft.scale_min} step={0.001} min={0.001} onChange={value => changeField("scale_min", value)} />
              <PricingField label="Scale maximum" value={draft.scale_max} step={0.001} min={draft.scale_min} onChange={value => changeField("scale_max", value)} />
              <PricingField label="Scale step" value={draft.scale_step} step={0.001} min={0.001} onChange={value => changeField("scale_step", value)} />
            </div>
          </div>

          <div className="admin-pricing__card">
            <h2 className="admin-section-title">Insurance tiers</h2>
            <p className="admin-pricing__helper">Monthly premium per 0.01× before health adjustments.</p>
            <div className="admin-pricing__grid">
              {tierOrder.map(tier => (
                <PricingField
                  key={tier}
                  label={`${tierLabels[tier]} tier`}
                  value={draft.insurance_pricing[tier]}
                  step={1}
                  min={0.01}
                  onChange={value => changeInsuranceField(tier, value)}
                />
              ))}
            </div>
          </div>

          <div className="admin-pricing__card">
            <h2 className="admin-section-title">Health multipliers</h2>
            <p className="admin-pricing__helper">Applied to the tier price according to the user&apos;s health bucket.</p>
            <div className="admin-pricing__grid">
              {bucketOrder.map(bucket => (
                <PricingField
                  key={bucket}
                  label={`${bucketLabels[bucket]} bucket`}
                  value={draft.health_bucket_multipliers[bucket]}
                  step={0.1}
                  min={0.1}
                  onChange={value => changeBucketField(bucket, value)}
                />
              ))}
            </div>
          </div>

          <div className="admin-pricing__card">
            <h2 className="admin-section-title">Points discount</h2>
            <p className="admin-pricing__helper">Memory points redeemed here reduce the monthly insurance bill automatically.</p>
            <div className="admin-pricing__grid">
              <PricingField
                label="Points per redemption"
                value={pointsDiscount.points_per_discount_unit}
                step={100}
                min={100}
                onChange={value => changePointsField("points_per_discount_unit", Math.max(1, Math.round(value)))}
              />
              <PricingField
                label="Discount per redemption ($/month)"
                value={pointsDiscount.discount_per_unit}
                step={1}
                min={0.01}
                onChange={value => changePointsField("discount_per_unit", value)}
              />
            </div>
            <p className="admin-pricing__helper">
              Example: {pointsDiscount.points_per_discount_unit.toLocaleString()} points → ${pointsDiscount.discount_per_unit.toFixed(2)} off each month.
            </p>
          </div>

          <div className="admin-pricing__actions">
            <button type="submit" className="pill-button" disabled={saving}>
              {saving ? "Saving…" : "Update pricing"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

function PricingField({
  label,
  value,
  onChange,
  step,
  min,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="admin-pricing__field">
      <span className="admin-pricing__field-label">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        min={min}
        onChange={event => onChange(Number(event.currentTarget.value))}
        className="admin-pricing__input"
      />
    </label>
  );
}
