import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: "#0A0A0A", raised: "#141414", overlay: "#1A1A1A" },
        accent: { DEFAULT: "#6366F1", glow: "#818CF8", dim: "#4F46E5" },
        neutral: { 50: "#FAFAFA", 100: "#F5F5F5", 400: "#A3A3A3", 500: "#737373", 700: "#404040", 900: "#171717" },
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      backdropBlur: { xs: "2px" },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(99, 102, 241, 0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(99, 102, 241, 0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
