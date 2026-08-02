import React from 'react';
import Navbar from '@/components/Navbar';

interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

export default function PageLayout({
  children,
  className = '',
  maxWidth = 'max-w-7xl',
}: PageLayoutProps) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      <Navbar />
      <main className={`${maxWidth} mx-auto px-4 py-8 ${className}`}>
        {children}
      </main>
    </div>
  );
}
