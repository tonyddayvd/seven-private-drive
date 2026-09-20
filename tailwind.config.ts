import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#09090b",
        card: "#121217",
        surface: "#18181f",
        border: "#27272a",
        primary: {
          DEFAULT: "#10b981", // Esmeralda Executivo
          hover: "#059669",
          dark: "#064e3b",
          light: "#34d399",
        },
        accent: {
          DEFAULT: "#3b82f6", // Azul Cobalto
          hover: "#2563eb",
          dark: "#1e3a8a",
          light: "#60a5fa",
        },
      },
    },
  },
  plugins: [],
};
export default config;
