// Colours resolve to CSS variables defined in global.css, which is generated
// from packages/ui-tokens (run `npm run tokens` after changing tokens).
const roles = [
  "background", "surface", "surface-strong", "border", "foreground", "muted", "subtle",
  "accent", "accent-foreground", "accent-soft", "success", "warning", "danger", "info",
  "price-verified", "price-cached", "price-estimated", "price-unavailable",
];

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: Object.fromEntries(roles.map((r) => [r, `rgb(var(--kp-${r}) / <alpha-value>)`])),
      borderRadius: { card: "22px", control: "16px" },
    },
  },
  plugins: [],
};
