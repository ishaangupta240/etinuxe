import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { DNATokenRecord, DreamRecordEntry, MemoryLogRecord, SleepCycleRecordEntry } from "../api";
import { useAdminOverview } from "../hooks/useAdminOverview";
import { makeSurface, pillButtonStyle, theme } from "../theme";

const layoutStyle: CSSProperties = {
  display: "grid",
  gap: 28,
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
  alignItems: "start",
};

const snapshotCard = makeSurface({ padding: 36, display: "grid", gap: 24 });
const panelCard = makeSurface({ padding: 28, display: "grid", gap: 16 });
const iframeWrapper = makeSurface({ padding: 0, overflow: "hidden" });

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 14px",
  background: theme.accentSoft,
  color: theme.accent,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontSize: "0.75rem",
  borderRadius: 999,
};

const metricGrid: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const metricCard: CSSProperties = {
  background: theme.surfaceTonal,
  border: `1px solid ${theme.outline}`,
  borderRadius: 16,
  padding: 18,
};

const logListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 12,
};

const logItemStyle: CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${theme.outline}`,
  background: theme.surfaceTonal,
  color: theme.textSecondary,
  fontSize: "0.9rem",
};

const dreamListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 12,
};

const dreamItemStyle = (category: string): CSSProperties => ({
  borderRadius: 14,
  border: `1px solid ${theme.outline}`,
  padding: "14px 16px",
  background: category === "nightmare" ? "rgba(244, 67, 54, 0.18)" : theme.surfaceTonal,
  display: "grid",
  gap: 6,
});

const tokenListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 10,
};

const tokenRowStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.outline}`,
  padding: "10px 14px",
  background: theme.surfaceTonal,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const sleepListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 12,
};

const memoryListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 12,
};

const memoryItemStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.outline}`,
  padding: "12px 14px",
  background: theme.surfaceTonal,
  display: "grid",
  gap: 6,
  color: theme.textSecondary,
  fontSize: "0.9rem",
};

const formatBooleanStatus = (value: number | string | boolean): string => {
  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }
  if (typeof value === "number") {
    return value !== 0 ? "Enabled" : "Disabled";
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" ? "Enabled" : "Disabled";
  }
  return String(value);
};

const formatUtcHour = (value: number | string | boolean): string => {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(numeric)) {
    const normalized = ((numeric % 24) + 24) % 24;
    return `${normalized.toString().padStart(2, "0")}:00 UTC`;
  }
  return String(value);
};

const formatHours = (value: number | string | boolean): string => {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isFinite(numeric)) {
    return `${numeric.toFixed(1)}h`;
  }
  return String(value);
};

const formatDateTime = (value: number | string | boolean, fallback = "Idle"): string => {
  if (typeof value === "string" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    }
    return value;
  }
  if (typeof value === "number") {
    return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  }
  return fallback;
};

interface LogEntry {
  id: number;
  text: string;
}

export default function AdminMarova(): JSX.Element {
  const { overview, loading, error, refresh } = useAdminOverview();
  const snapshot = overview?.organism_state ?? null;
  const summary = overview?.summary;

  const dreams = useMemo<DreamRecordEntry[]>(() => (overview ? [...overview.dreams].reverse() : []), [overview]);
  const sleepCycles = useMemo<SleepCycleRecordEntry[]>(() => (overview ? [...overview.sleep_cycles].reverse() : []), [overview]);
  const dnaTokens = useMemo<DNATokenRecord[]>(
    () => (overview ? [...overview.dna_tokens].sort((a, b) => b.remaining_energy - a.remaining_energy) : []),
    [overview]
  );
  const memoryLogs = useMemo<MemoryLogRecord[]>(() => (overview ? [...overview.memory_logs].reverse() : []), [overview]);

  const dreamFeed = useMemo(() => dreams.slice(0, 6), [dreams]);
  const sleepFeed = useMemo(() => sleepCycles.slice(0, 6), [sleepCycles]);
  const tokenFeed = useMemo(() => dnaTokens.slice(0, 6), [dnaTokens]);
  const memoryFeed = useMemo(() => memoryLogs.slice(0, 6), [memoryLogs]);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastDreamId, setLastDreamId] = useState<string | null>(null);
  const [lastCycleId, setLastCycleId] = useState<string | null>(null);
  const [lastVitalsSignature, setLastVitalsSignature] = useState<string | null>(null);

  const addLogEntry = useCallback((message: string) => {
    setLog(entries => [{ id: Date.now(), text: message }, ...entries].slice(0, 15));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const signature = `${snapshot.hunger.toFixed(2)}|${snapshot.dream_energy.toFixed(2)}|${snapshot.sleep_phase}|${snapshot.mood}`;
    if (signature === lastVitalsSignature) {
      return;
    }
    setLastVitalsSignature(signature);
    addLogEntry(
      `Vitals ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}: dream ${snapshot.dream_energy.toFixed(2)} · debt ${snapshot.dream_debt.toFixed(2)} · phase ${snapshot.sleep_phase}`
    );
  }, [snapshot, lastVitalsSignature, addLogEntry]);

  useEffect(() => {
    if (dreamFeed.length === 0) {
      return;
    }
    const latest = dreamFeed[0];
    if (latest.id === lastDreamId) {
      return;
    }
    setLastDreamId(latest.id);
    addLogEntry(
      `Dream ${latest.category} ${new Date(latest.timestamp).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}: ${latest.outcome} · energy ${latest.energy_used.toFixed(2)}`
    );
  }, [dreamFeed, lastDreamId, addLogEntry]);

  useEffect(() => {
    if (sleepFeed.length === 0) {
      return;
    }
    const latest = sleepFeed[0];
    if (latest.id === lastCycleId) {
      return;
    }
    setLastCycleId(latest.id);
    const quality = (latest.quality * 100).toFixed(0);
    const prefix = latest.abrupt_wake ? " · abrupt" : "";
    addLogEntry(`Sleep ${new Date(latest.occurred_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}: ${latest.duration_hours.toFixed(1)}h @ ${quality}%${prefix}`);
  }, [sleepFeed, lastCycleId, addLogEntry]);

  const iframeSrc = useMemo(() => "/admin/marova/hologram/index.html", []);

  return (
    <div style={layoutStyle}>
      <div style={{ display: "grid", gap: 24 }}>
        <section style={snapshotCard}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={badgeStyle}>Vault Hydrosphere</span>
            <h2 style={{ margin: 0, fontSize: "1.8rem", letterSpacing: "0.06em" }}>Marova Telemetry Capsule</h2>
            <p style={{ margin: 0, color: theme.textSecondary, lineHeight: 1.7 }}>
              Oversight dashboard mirroring the holographic jellyfish lattice. Monitor vitals, dream fuel, and resonant memory threads
              before stepping into the hologram bay.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" style={pillButtonStyle({ padding: "10px 22px" })} onClick={() => void refresh()}>
              Manual Sync
            </button>
            <button
              type="button"
              style={pillButtonStyle({
                padding: "10px 22px",
                background: "transparent",
                border: `1px solid ${theme.outline}`,
                color: theme.accent,
                boxShadow: "none",
              })}
              onClick={() => window.open(iframeSrc, "_blank", "noopener")}
            >
              Open Hologram ↗
            </button>
          </div>
          {error && (
            <div style={{ ...makeSurface({ padding: 18, background: "rgba(255, 99, 132, 0.12)" }), borderColor: theme.danger, color: theme.danger }}>
              Telemetry error: {error}
            </div>
          )}
          <div style={metricGrid}>
            <Metric label="Hunger" value={snapshot?.hunger} loading={loading} format={value => (value as number).toFixed(2)} />
            <Metric label="Metabolism" value={snapshot?.metabolism} loading={loading} format={value => (value as number).toFixed(2)} />
            <Metric label="Mood" value={snapshot?.mood} loading={loading} format={value => String(value)} />
            <Metric label="Dream Energy" value={snapshot?.dream_energy} loading={loading} format={value => (value as number).toFixed(2)} />
            <Metric label="Dream Debt" value={snapshot?.dream_debt} loading={loading} format={value => (value as number).toFixed(2)} />
            <Metric label="Sleep Phase" value={snapshot?.sleep_phase} loading={loading} format={value => String(value)} />
            <Metric label="Toxicity" value={snapshot?.toxicity_level} loading={loading} format={value => (value as number).toFixed(2)} />
            <Metric label="DNA Reserve" value={summary?.dna_energy} loading={loading} format={value => (value as number).toFixed(2)} />
            <Metric
              label="Last Feed"
              value={snapshot?.last_feed}
              loading={loading}
              format={value => (value ? new Date(value as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never")}
            />
            <Metric
              label="Last Sleep"
              value={snapshot?.last_sleep}
              loading={loading}
              format={value => (value ? new Date(value as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Never")}
            />
            <Metric label="Auto Sleep" value={snapshot?.auto_sleep_enabled} loading={loading} format={formatBooleanStatus} />
            <Metric label="Sleep Schedule" value={snapshot?.sleep_schedule_hour} loading={loading} format={formatUtcHour} />
            <Metric label="Wake Target" value={snapshot?.wake_schedule_hour} loading={loading} format={formatUtcHour} />
            <Metric label="Sleep Duration" value={snapshot?.sleep_duration_hours} loading={loading} format={formatHours} />
            <Metric
              label="Sleep Session Start"
              value={snapshot?.sleep_session_started_at ?? "Idle"}
              loading={loading}
              format={value => formatDateTime(value, "Idle")}
            />
            <Metric
              label="Sleep Session Ends"
              value={snapshot?.sleep_session_ends_at ?? "Pending"}
              loading={loading}
              format={value => formatDateTime(value, "Pending")}
            />
          </div>
          <p style={{ fontSize: "0.85rem", color: theme.textSecondary }}>
            Sensitivity threshold {snapshot ? snapshot.sensitivity_threshold.toFixed(2) : "--"} · toxicity shield {snapshot ? snapshot.toxicity_resistance.toFixed(2) : "--"} · dream tolerance {snapshot ? snapshot.dream_tolerance.toFixed(2) : "--"}
          </p>
          {summary && (
            <p style={{ fontSize: "0.85rem", color: theme.textSecondary }}>
              Dream store {summary.dream_energy.toFixed(2)} · DNA pool {summary.dna_energy.toFixed(2)} · Sleep quality avg {Math.round(summary.avg_sleep_quality * 100)}%
            </p>
          )}
        </section>
        <section style={panelCard}>
          <h3 style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "0.12em", textTransform: "uppercase", color: theme.textSecondary }}>
            Vault Broadcast
          </h3>
          <ul style={logListStyle}>
            {log.length === 0 && <li style={logItemStyle}>Awaiting telemetry handshake…</li>}
            {log.map(entry => (
              <li key={entry.id} style={logItemStyle}>
                {entry.text}
              </li>
            ))}
          </ul>
        </section>
        <section style={panelCard}>
          <h3 style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "0.12em", textTransform: "uppercase", color: theme.textSecondary }}>
            Dream Sequence
          </h3>
          {dreamFeed.length === 0 ? (
            <p style={{ color: theme.textSecondary }}>No dream resonance recorded yet.</p>
          ) : (
            <ul style={dreamListStyle}>
              {dreamFeed.map(dream => (
                <li key={dream.id} style={dreamItemStyle(dream.category)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <strong style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}>{dream.category}</strong>
                    <span style={{ fontSize: "0.8rem", color: theme.textSecondary }}>
                      {new Date(dream.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </span>
                  </div>
                  <span style={{ color: theme.textSecondary }}>
                    Outcome <strong>{dream.outcome}</strong> · intensity {dream.intensity.toFixed(2)} · energy {dream.energy_used.toFixed(2)} (state {dream.state_energy_used.toFixed(2)} · DNA {dream.dna_energy_used.toFixed(2)})
                  </span>
                  <span style={{ color: theme.textSecondary, fontSize: "0.85rem" }}>
                    Tokens {dream.memory_tokens_consumed} · Effects {dream.effects.length ? dream.effects.join(", ") : "none"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside style={{ display: "grid", gap: 24 }}>
        <section style={iframeWrapper}>
          <iframe
            title="Marova hologram"
            src={iframeSrc}
            loading="lazy"
            style={{ width: "100%", height: "100%", minHeight: 520, border: "none" }}
            allow="fullscreen"
          />
        </section>
        <section style={panelCard}>
          <h3 style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "0.12em", textTransform: "uppercase", color: theme.textSecondary }}>
            DNA Reservoir
          </h3>
          {tokenFeed.length === 0 ? (
            <p style={{ color: theme.textSecondary }}>No DNA tokens minted.</p>
          ) : (
            <ul style={tokenListStyle}>
              {tokenFeed.map(token => (
                <li key={token.id} style={tokenRowStyle}>
                  <div>
                    <strong style={{ display: "block" }}>Token {token.id.slice(0, 8)}</strong>
                    <span style={{ color: theme.textSecondary, fontSize: "0.85rem" }}>
                      Energy {token.remaining_energy.toFixed(2)} · Holder {token.user_id.slice(0, 8)}
                    </span>
                  </div>
                  <span style={{ color: theme.textSecondary, fontSize: "0.8rem" }}>
                    {new Date(token.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section style={panelCard}>
          <h3 style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "0.12em", textTransform: "uppercase", color: theme.textSecondary }}>
            Sleep Archive
          </h3>
          {sleepFeed.length === 0 ? (
            <p style={{ color: theme.textSecondary }}>No sleep cycles captured.</p>
          ) : (
            <ul style={sleepListStyle}>
              {sleepFeed.map(cycle => (
                <li key={cycle.id} style={tokenRowStyle}>
                  <div>
                    <strong style={{ display: "block" }}>{cycle.duration_hours.toFixed(1)}h cycle</strong>
                    <span style={{ color: theme.textSecondary, fontSize: "0.85rem" }}>
                      Quality {(cycle.quality * 100).toFixed(0)}%{cycle.abrupt_wake ? " · abrupt wake" : ""}
                    </span>
                  </div>
                  <span style={{ color: theme.textSecondary, fontSize: "0.8rem" }}>
                    {new Date(cycle.occurred_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section style={panelCard}>
          <h3 style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "0.12em", textTransform: "uppercase", color: theme.textSecondary }}>
            Memory Resonance
          </h3>
          {memoryFeed.length === 0 ? (
            <p style={{ color: theme.textSecondary }}>No memory logs ingested.</p>
          ) : (
            <ul style={memoryListStyle}>
              {memoryFeed.map(entry => (
                <li key={entry.id} style={memoryItemStyle}>
                  <strong style={{ color: theme.textPrimary }}>{trimText(entry.memory_text, 160)}</strong>
                  <span>
                    Valence {entry.valence.toFixed(2)} · Strength {entry.strength.toFixed(2)} · Toxicity {entry.toxicity.toFixed(2)}
                  </span>
                  <span style={{ fontSize: "0.8rem" }}>{new Date(entry.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Metric({
  label,
  value,
  loading,
  format,
}: {
  label: string;
  value: number | string | boolean | null | undefined;
  loading: boolean;
  format: (value: number | string | boolean) => string;
}): JSX.Element {
  const display = loading
    ? "Syncing…"
    : value === null || value === undefined
    ? "Unavailable"
    : format(value as number | string | boolean);

  return (
    <article style={metricCard}>
      <h3 style={{ margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: theme.textSecondary }}>
        {label}
      </h3>
      <strong style={{ display: "block", marginTop: 10, fontSize: "1.35rem" }}>{display}</strong>
    </article>
  );
}

function trimText(body: string, limit = 140): string {
  if (body.length <= limit) {
    return body;
  }
  return `${body.slice(0, limit - 3)}...`;
}
