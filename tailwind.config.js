/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fused: {
          bg: "#0f1117",
          sidebar: "#161b27",
          card: "#1e2535",
          line: "#2f3a50",
          text: "#e8f0ff",
          muted: "#9ba8c7",
          accentStart: "#00d4aa",
          accentEnd: "#00ff88",
        },
      },
      fontFamily: {
        sans: ["Geist", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 16px 42px rgba(0, 0, 0, 0.38)",
      },
      backgroundImage: {
        "accent-gradient": "linear-gradient(135deg, #00d4aa 0%, #00ff88 100%)",
      },
      keyframes: {
        pulseDot: {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.35" },
          "40%": { transform: "translateY(-3px)", opacity: "1" },
        },
        drift: {
          "0%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(8px, -10px, 0)" },
          "100%": { transform: "translate3d(0, 0, 0)" },
        },
      },
      animation: {
        "pulse-dot": "pulseDot 1.2s ease-in-out infinite",
        drift: "drift 7s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}

