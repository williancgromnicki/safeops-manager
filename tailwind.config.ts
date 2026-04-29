import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe8ff",
          500: "#2563eb",
          700: "#1e3a8a",
          900: "#0f172a",
        },
        accent: {
          green: "#16a34a",
          blue: "#0ea5e9",
        },
        surface: {
          light: "#f8fafc",
          card: "#ffffff",
          border: "#e2e8f0",
        },
      },
    },
  },
  plugins: [],
};

export default config;
