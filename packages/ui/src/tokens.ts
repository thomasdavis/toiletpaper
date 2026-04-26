/**
 * Design tokens for toiletpaper UI.
 *
 * Scientific-journal aesthetic: serif headings, monospace data,
 * muted earth-tone palette, dense information layout.
 */

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const colors = {
  // Backgrounds
  paper: "#FAFAF8",
  paperWarm: "#F5F3EF",
  white: "#FFFFFF",

  // Text
  ink: "#1A1A1A",
  inkLight: "#3D3D3D",
  inkMuted: "#6B6B6B",
  inkFaint: "#9B9B9B",

  // Borders
  rule: "#D4D0C8",
  ruleFaint: "#E8E5DE",
  ruleStrong: "#B0ADA6",

  // Primary — slate blue
  primary: "#4A6FA5",
  primaryLight: "#6B8FBF",
  primaryFaint: "#E8EEF5",
  primaryDark: "#3A5A87",

  // Verdict states
  reproduced: "#2D6A4F",
  reproducedLight: "#D4EDE1",
  contradicted: "#9B2226",
  contradictedLight: "#F5D5D6",
  fragile: "#B07D2B",
  fragileLight: "#F5ECD4",
  undetermined: "#6B6B6B",
  undeterminedLight: "#E8E5DE",
  notSimulable: "#8B8589",
  notSimulableLight: "#EDEBEC",

  // Semantic
  info: "#4A6FA5",
  infoLight: "#E8EEF5",
  success: "#2D6A4F",
  successLight: "#D4EDE1",
  warning: "#B07D2B",
  warningLight: "#F5ECD4",
  error: "#9B2226",
  errorLight: "#F5D5D6",
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const fontFamily = {
  serif: 'Georgia, "Times New Roman", Times, serif',
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
} as const;

export const fontSize = {
  xs: "12px",
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "30px",
  "4xl": "36px",
  "5xl": "48px",
} as const;

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  tight: "1.2",
  snug: "1.35",
  normal: "1.5",
  relaxed: "1.65",
} as const;

export const letterSpacing = {
  tight: "-0.02em",
  normal: "0",
  wide: "0.025em",
  wider: "0.05em",
  caps: "0.08em",
} as const;

// ---------------------------------------------------------------------------
// Spacing — 4px base
// ---------------------------------------------------------------------------

export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

// ---------------------------------------------------------------------------
// Radii
// ---------------------------------------------------------------------------

export const radii = {
  none: "0px",
  sm: "2px",
  md: "4px",
  lg: "8px",
  xl: "12px",
  "2xl": "16px",
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

export const shadows = {
  subtle: "0 1px 2px rgba(0, 0, 0, 0.04)",
  medium: "0 2px 8px rgba(0, 0, 0, 0.08)",
  elevated: "0 8px 24px rgba(0, 0, 0, 0.12)",
} as const;

// ---------------------------------------------------------------------------
// Borders
// ---------------------------------------------------------------------------

export const borders = {
  hairline: "0.5px solid var(--color-rule)",
  thin: "1px solid var(--color-rule)",
  medium: "2px solid var(--color-rule)",
} as const;

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
} as const;
