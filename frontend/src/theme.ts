import type { CSSProperties } from "react";

export const theme = {
  bodyGradient: "var(--body-gradient)",
  surfaceGradient: "var(--surface-gradient)",
  surfaceAlt: "var(--surface-alt)",
  surface: "var(--surface)",
  surfaceTonal: "var(--surface-tonal)",
  border: "var(--border-color)",
  borderSubtle: "var(--border-subtle)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  accent: "var(--accent)",
  accentBright: "var(--accent-bright)",
  accentSoft: "var(--accent-soft)",
  glow: "var(--glow)",
  outline: "var(--outline)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export function makeSurface(overrides: CSSProperties = {}): CSSProperties {
  return {
    background: theme.surfaceGradient,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
    boxShadow: theme.glow,
    padding: 28,
    ...overrides,
  };
}

export function pillButtonStyle(overrides: CSSProperties = {}): CSSProperties {
  return {
    background: `linear-gradient(135deg, ${theme.accentBright}, ${theme.accent})`,
    color: theme.textPrimary,
    border: "none",
    borderRadius: 999,
    padding: "12px 26px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    cursor: "pointer",
    boxShadow: "0 18px 35px rgba(42, 92, 188, 0.45)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
    ...overrides,
  };
}
