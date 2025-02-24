import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class", // Enables dark mode via a class (e.g., <html class="dark">)
  theme: {
    extend: {
      colors: {
        background: "var(--background, #f8fafc)", // Light mode fallback
        foreground: "var(--foreground, #1e293b)", // Dark mode fallback
        primary: {
          DEFAULT: "#6366F1", // Indigo-500
          dark: "#4F46E5", // Indigo-600
        },
        secondary: {
          DEFAULT: "#14B8A6", // Teal-500
          dark: "#0D9488", // Teal-600
        },
        accent: {
          DEFAULT: "#EAB308", // Amber-500
          dark: "#CA8A04", // Amber-600
        },
        muted: "#64748B", // Gray-500
      },
      spacing: {
        "18": "4.5rem", // 72px
        "22": "5.5rem", // 88px
        "28": "7rem", // 112px
        "36": "9rem", // 144px
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      fontSize: {
        sm: ["0.875rem", "1.5rem"], // Small text with proper line height
        base: ["1rem", "1.75rem"], // Default text size
        lg: ["1.125rem", "2rem"], // Slightly larger for readability
        xl: ["1.25rem", "2.25rem"], // Headings
        "2xl": ["1.5rem", "2.5rem"], // Larger headings
      },
    },
  },
  plugins: [], // No plugins used
} satisfies Config;