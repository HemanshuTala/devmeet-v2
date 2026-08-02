import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/providers/AppProviders';
import { MobileBlocker } from '@/components/layout/MobileBlocker';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <body
        className={`${plusJakartaSans.className} ${plusJakartaSans.variable} ${jetbrainsMono.variable} font-sans`}
      >
        <MobileBlocker />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
