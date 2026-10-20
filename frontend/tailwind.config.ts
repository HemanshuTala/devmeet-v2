/**
 * ============================================================================
 * DevMeet Frontend - Tailwind CSS Design System Configuration
 * ============================================================================
 * Defines the core typography, HSL color tokens, animations, and container
 * constraints powering the DevMeet design system.
 *
 * Key Design System Features:
 * 1. Dark Mode: Enabled via CSS `.dark` class hierarchy.
 * 2. Dynamic Semantic HSL Tokens:
 *    - Uses CSS variables (`hsl(var(--primary))`, `hsl(var(--background))`)
 *      enabling seamless runtime dark/light theme switching without page reloads.
 * 3. Typography Hierarchy:
 *    - Primary Sans: Plus Jakarta Sans / system fonts for clean readability.
 *    - Monospace: JetBrains Mono / Fira Code for code editor panels and terminal outputs.
 * 4. Micro-Interactions:
 *    - Keyframe animations for Radix UI accordions and collapsible sidebars.
 * ============================================================================
 */

import type { Config } from "tailwindcss"

const config = {
  // Class-based dark mode switching (controlled via ThemeProvider / uiStore)
  darkMode: ["class"],

  // Files scanned for utility class generation
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Font family definitions with CSS variable bindings and system fallbacks
      fontFamily: {
        sans: ["var(--font-jakarta)", "Plus Jakarta Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Fira Code", "monospace"],
      },
      // Theme colors using semantic CSS variables
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      // Dynamic border radius scale
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Keyframe animations for expandable drawers and accordions
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  // Plugin providing smooth transition animations
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
