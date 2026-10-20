# DevMeet Frontend Design System

This document outlines the visual design tokens, component architecture, styling conventions, and accessibility guidelines across the DevMeet platform.

---

## 1. Core Design Tokens

### 1.1 Color Palette

The DevMeet interface uses a refined color palette optimized for high contrast, clean hierarchy, and reduced visual fatigue.

| Token | Class / Value | Intended Usage |
|---|---|---|
| **Primary Brand** | `bg-blue-600` / `#2563eb` | Primary buttons, active state indicators, key brand accents |
| **Brand Dark** | `bg-blue-700` / `#1d4ed8` | Hover states for primary buttons, active pressed states |
| **Brand Light** | `bg-blue-50` / `#eff6ff` | Subtle badge backgrounds, selection highlights, card tinting |
| **Background Main** | `bg-slate-50` / `#f8fafc` | Primary canvas background for dashboard and auth screens |
| **Surface Card** | `bg-white` / `#ffffff` | Elevated cards, tables, modal dialogs, and navigation headers |
| **Border Subtle** | `border-slate-200` / `#e2e8f0` | Standard card borders, dividers, input container boundaries |
| **Border Focus** | `border-blue-600` / ring-blue-500 | Interactive input focus states with 2px offset rings |
| **Text Primary** | `text-slate-900` / `#0f172a` | Headings, emphasized labels, high-contrast metrics |
| **Text Secondary** | `text-slate-600` / `#475569` | Body paragraphs, descriptive helper copy |
| **Text Muted** | `text-slate-400` / `#94a3b8` | Timestamps, placeholders, inactive icons |
| **Success / Green** | `text-emerald-600`, `bg-emerald-50` | Passing scores, completed sessions, healthy service status |
| **Warning / Amber** | `text-amber-600`, `bg-amber-50` | Security alerts, quota thresholds, medium scores |
| **Destructive / Rose** | `text-rose-600`, `bg-rose-50` | Cheating flags, termination modals, validation errors |

---

## 2. Typography

DevMeet uses **Plus Jakarta Sans** for headings and interface copy, paired with **JetBrains Mono** / **Fira Code** for code execution blocks and monospace telemetry.

### Type Scale

| Element | Size | Weight | Tracking | Usage |
|---|---|---|---|---|
| **Display H1** | `text-4xl` sm:`text-5xl` | Extrabold (800) | `-0.025em` | Landing hero and primary page titles |
| **Section H2** | `text-2xl` sm:`text-3xl` | Bold (700) | `-0.02em` | Card group titles, dashboard section headers |
| **Card H3** | `text-lg` sm:`text-xl` | Bold (700) | `-0.01em` | Individual widget and modal titles |
| **Body Large** | `text-base` sm:`text-lg` | Regular (400) / Medium (500) | `normal` | Hero subtext, feature descriptions |
| **Body Normal** | `text-sm` (14px) | Regular (400) / Medium (500) | `normal` | Standard table rows, inputs, descriptions |
| **Caption / Meta** | `text-xs` (12px) | Semibold (600) | `0.01em` | Badges, timestamps, small action labels |
| **Code / Monospace** | `text-xs` / `text-sm` | Medium (500) | `monospace` | Code editor tokens, JSON outputs, keys |

---

## 3. Shadows & Elevation

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.03);
--shadow-2xl: 0 25px 50px -12px rgba(37, 99, 235, 0.08);
```

- **Cards**: `rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md transition-shadow`.
- **Modals**: `rounded-2xl border border-slate-200/80 bg-white shadow-2xl p-6`.
- **Primary Buttons**: `bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/10`.

---

## 4. Standard Reusable UI Components

### 4.1 Buttons (`src/components/ui/button.tsx`)
- `default`: Primary brand button with indigo/blue background.
- `gradient`: Vivid blue-600 with elevated drop shadow.
- `outline`: Light slate border with clean background hover.
- `secondary`: Soft muted background for secondary dismissive actions.
- `destructive`: Rose background for irreversible actions (e.g. End Interview, Delete Account).

### 4.2 Form Inputs (`src/components/ui/input.tsx`)
- Uniform height of `h-11` (44px) for touch and desktop accessibility.
- Subtle placeholder text in `slate-400`.
- Integrated error styling with red borders and localized helper text.

### 4.3 Modal Dialogs (`src/components/ui/modal.tsx`)
- Standardized backdrop with `bg-slate-900/40 backdrop-blur-sm`.
- Automatic escape key listener and body scroll locking.
- Title, subtitle, and accessible close icon.

### 4.4 Status & Metric Badges (`src/components/SessionBadge.tsx`)
- **DSA**: Cyan badge with code brackets icon.
- **Behavioral**: Amber badge with speech bubble icon.
- **System Design**: Purple badge with network node icon.
- **Difficulty Badges**: Green for Easy, Amber for Medium, Red for Hard.

---

## 5. Responsive Design Conventions

1. **Mobile (<640px)**: Single column layouts, stacked forms, condensed table cards, sticky CTA bars.
2. **Tablet (640px - 1024px)**: 2-column stat grids, collapsed sidebars with hamburger sheet navigation.
3. **Desktop (>=1024px)**: Persistent left sidebar navigation (`DashboardShell`), multi-pane code + chat interview layout.
