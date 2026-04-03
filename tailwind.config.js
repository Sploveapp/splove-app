/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#0F0F14",
          card: "#18181B",
          border: "#2A2A2E",
          text: "#FFFFFF",
          muted: "#A1A1AA",
          accent: "#FF1E2D",
          accentHover: "#E11D2E",
        },
      },
    },
  },
  plugins: [],
};
