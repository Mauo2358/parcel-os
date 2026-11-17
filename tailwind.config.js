/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { mono: ['"JetBrains Mono"', '"Cascadia Code"', "Consolas", "ui-monospace", "monospace"] },
      colors: {
        bay: { 950: "#0b0d0e", 900: "#111416", 850: "#15191b", 800: "#1b2023", 700: "#262c30", 500: "#5c656b", 300: "#a3aaae", 100: "#dcdad4" },
        hazard: { DEFAULT: "#f5a524", dim: "#3a2a0c" },
        valid: "#5fd38d",
        reject: "#ff5d5d",
        scan: "#6cb6ff",
        air: "#6cb6ff",
        sea: "#2dd4bf",
      },
    },
  },
  plugins: [],
};
