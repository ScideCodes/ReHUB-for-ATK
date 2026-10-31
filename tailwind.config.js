/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-elevated":
          "rgb(var(--color-surface-elevated) / <alpha-value>)",
        "surface-border": "rgb(var(--color-surface-border) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-ember": "rgb(var(--color-accent-ember) / <alpha-value>)",
        "accent-burnt": "rgb(var(--color-accent-burnt) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        "text-muted": "rgb(var(--color-text-muted) / <alpha-value>)",
        "text-faint": "rgb(var(--color-text-faint) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          '"Space Grotesk Variable"',
          '"Space Grotesk"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono Variable"',
          '"JetBrains Mono"',
          "ui-monospace",
          "monospace",
        ],
      },
      backdropBlur: {
        glass: "28px",
        heavy: "32px",
      },
      transitionTimingFunction: {
        hub: "var(--ease-hub)",
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        slow: "var(--duration-slow)",
      },
      boxShadow: {
        frosted: "var(--shadow-glass)",
        highlight: "none",
      },
    },
  },
  plugins: [],
};
