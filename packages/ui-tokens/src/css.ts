import {
  colorRoles,
  darkColors,
  lightColors,
  motion,
  radius,
  type ColorScheme,
} from "./tokens";

/** "#2F6B4F" -> "47 107 79" (space-separated channels for rgb(var(--x) / a)). */
export function hexToRgbChannels(hex: string): string {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Expected a 6-digit hex colour, received "${hex}"`);
  }
  const value = Number.parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].join(" ");
}

function colorVars(scheme: ColorScheme, indent: string): string {
  return colorRoles
    .map((role) => `${indent}--kp-${role}: ${hexToRgbChannels(scheme[role])};`)
    .join("\n");
}

const HEADER = `/* GENERATED FILE — do not edit by hand.
 * Source: packages/ui-tokens/src/tokens.ts
 * Regenerate with: npm run tokens
 */`;

/**
 * CSS custom properties for the web app. Theme resolution:
 *  - default: follows the OS (prefers-color-scheme)
 *  - <html data-theme="light|dark"> forces a theme (set from the profile toggle)
 */
export function buildWebCss(): string {
  const radiusVars = Object.entries(radius)
    .map(([k, v]) => `  --kp-radius-${k}: ${v}px;`)
    .join("\n");

  return `${HEADER}

:root {
${colorVars(lightColors, "  ")}
${radiusVars}
  --kp-ease: ${motion.easing};
  --kp-duration-fast: ${motion.fast}ms;
  --kp-duration-base: ${motion.base}ms;
  --kp-duration-slow: ${motion.slow}ms;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${colorVars(darkColors, "    ")}
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
${colorVars(darkColors, "  ")}
  color-scheme: dark;
}
`;
}

/**
 * Global stylesheet for the Expo app. NativeWind resolves the media query
 * against the device colour scheme.
 */
export function buildMobileCss(): string {
  return `${HEADER}

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
${colorVars(lightColors, "  ")}
}

@media (prefers-color-scheme: dark) {
  :root {
${colorVars(darkColors, "    ")}
  }
}
`;
}
