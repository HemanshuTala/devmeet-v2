/**
 * @file layout.tsx
 * @description Next.js App Router Root Layout Component for DevMeet.
 *
 * Responsibilities:
 * 1. Global Font Optimization (`next/font/google`):
 *    - Loads `Plus Jakarta Sans` as the primary sans-serif display typography (`--font-jakarta`).
 *    - Loads `JetBrains Mono` for Monaco code editor and code blocks (`--font-mono`).
 *    - Uses `display: 'swap'` for zero FOIT (Flash of Invisible Text).
 * 2. Application-Wide SEO & OpenGraph Metadata:
 *    - Establishes title templates, search keywords, author, and OpenGraph social share previews.
 * 3. Mobile Viewport Guard:
 *    - Mounts [MobileBlocker](file:///e:/AI%20INTERVIEW/frontend/src/components/layout/MobileBlocker.tsx) to safeguard complex multi-pane interview rooms.
 * 4. Provider Tree Composition:
 *    - Mounts [AppProviders](file:///e:/AI%20INTERVIEW/frontend/src/providers/AppProviders.tsx) (TanStack React Query, AuthContext, Sonner Toaster).
 *
 * @module app/layout
 */

import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/providers/AppProviders';
import { MobileBlocker } from '@/components/layout/MobileBlocker';

/** Plus Jakarta Sans Google Font Configuration */
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

/** JetBrains Mono Google Font Configuration for Code / Terminal */
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

/** Global SEO and OpenGraph metadata configuration */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'DevMeet — AI-Powered Mock Interview Platform',
    template: '%s | DevMeet',
  },
  description:
    'Practice technical interviews with real AI feedback. Master DSA, Behavioral, and System Design interviews powered by Groq LLM.',
  keywords: ['interview practice', 'AI interview', 'DSA', 'coding interview', 'mock interview', 'FAANG prep'],
  authors: [{ name: 'Hemanshu Tala' }],
  openGraph: {
    title: 'DevMeet — AI-Powered Mock Interview Platform',
    description: 'Practice technical interviews with real AI feedback.',
    type: 'website',
  },
};

/**
 * RootLayout Component.
 *
 * @component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child segment route elements.
 * @returns {JSX.Element} Base HTML document with font variables and context providers.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body
        className={`${plusJakartaSans.className} ${plusJakartaSans.variable} ${jetbrainsMono.variable} font-sans`}
      >
        {/* Enforces minimum 1024px screen width requirement */}
        <MobileBlocker />
        {/* Global Context Providers (TanStack Query, Auth, Toaster) */}
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
