/**
 * Kitchen Pantry design tokens — the single source of truth for colour,
 * type, spacing, radius and motion across web (Tailwind v4) and mobile
 * (NativeWind). Colours are stored as hex here and emitted as RGB triplets
 * in CSS so both Tailwind versions can apply opacity modifiers.
 *
 * After editing this file run `npm run tokens` from the repo root to
 * regenerate the CSS consumed by both apps.
 */

export const brand = {
  name: "Kitchen Pantry",
  shortName: "Pantry",
  tagline: "Cook well. Spend less. Waste nothing.",
} as const;

/** Semantic colour roles. Every role must exist in both themes. */
export const colorRoles = [
  "background",
  "surface",
  "surface-strong",
  "border",
  "foreground",
  "muted",
  "subtle",
  "accent",
  "accent-foreground",
  "accent-soft",
  "success",
  "warning",
  "danger",
  "info",
  // Price-status colours — users must never confuse an estimate with a verified price.
  "price-verified",
  "price-cached",
  "price-estimated",
  "price-unavailable",
] as const;

export type ColorRole = (typeof colorRoles)[number];
export type ColorScheme = Record<ColorRole, string>;

export const lightColors: ColorScheme = {
  background: "#FFFFFF",
  surface: "#F6F6F3",
  "surface-strong": "#ECECE6",
  border: "#E3E3DC",
  foreground: "#16181A",
  muted: "#64686B",
  subtle: "#8E9295",
  accent: "#2F6B4F",
  "accent-foreground": "#FFFFFF",
  "accent-soft": "#E4EFE8",
  success: "#1E7F48",
  warning: "#A86B12",
  danger: "#BE3A26",
  info: "#2862A6",
  "price-verified": "#1E7F48",
  "price-cached": "#2862A6",
  "price-estimated": "#A86B12",
  "price-unavailable": "#8E9295",
};

export const darkColors: ColorScheme = {
  background: "#0E0F10",
  surface: "#18191B",
  "surface-strong": "#222427",
  border: "#2D2F33",
  foreground: "#F2F2EE",
  muted: "#A6AAAD",
  subtle: "#74787C",
  accent: "#74C49A",
  "accent-foreground": "#0B1A12",
  "accent-soft": "#1B2D23",
  success: "#55C68A",
  warning: "#E3AC50",
  danger: "#F07D67",
  info: "#72AAE8",
  "price-verified": "#55C68A",
  "price-cached": "#72AAE8",
  "price-estimated": "#E3AC50",
  "price-unavailable": "#74787C",
};

/** Corner radius scale in px. Cards use `xl`, chips use `full`. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  "2xl": 28,
  full: 9999,
} as const;

/** 4px base spacing scale. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Type scale: [font size px, line height px]. Large and readable by default. */
export const fontSize = {
  caption: [13, 18],
  sm: [15, 21],
  base: [17, 25],
  lg: [20, 27],
  xl: [24, 30],
  "2xl": [30, 36],
  display: [40, 44],
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

/** Durations in ms. Keep motion subtle; respect reduced-motion on every platform. */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

export const layout = {
  /** Max readable content width on desktop. */
  contentMaxWidth: 1080,
  sidebarWidth: 248,
  /** Minimum touch target on both platforms. */
  minTouchTarget: 44,
} as const;
