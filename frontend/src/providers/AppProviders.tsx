'use client';

/**
 * ============================================================================
 * DevMeet Frontend - Global Application Provider Pipeline
 * ============================================================================
 * Composes the essential context providers, network query caches, toast notification
 * portals, and navigation progress indicators wrapping the entire Next.js application tree.
 *
 * Provider Stack Hierarchy:
 * 1. TanStack Query (`QueryClientProvider`):
 *    - Configures global query cache with 60-second `staleTime` and 5-minute garbage collection.
 *    - Disables noisy window refocus refetches for stable interview screen state.
 * 2. Identity & Session (`AuthProvider`):
 *    - Mounts global authentication context, session hydration, and token refresh.
 * 3. Micro-Interaction Tooltips (`TooltipProvider`):
 *    - Sets consistent 300ms hover delay for accessible Radix UI tooltips.
 * 4. Toast Notifications (`Toaster` via Sonner):
 *    - Configures top-right dismissible toast alerts with rich semantic colors.
 * 5. Route Transition Progress Bar (`ProgressBar`):
 *    - Visual blue indicator along top edge reflecting client-side Next.js route transitions.
 * ============================================================================
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';

/**
 * Factory creating an isolated TanStack Query client configured with resilient defaults.
 *
 * @returns Configured QueryClient instance.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,          // Treat cached data as fresh for 60 seconds
        gcTime: 5 * 60 * 1000,          // Keep unused cache data in memory for 5 minutes
        retry: 1,                       // Retry failed queries at most once before erroring
        refetchOnWindowFocus: false,    // Prevent unexpected refetches during live interviews
      },
      mutations: {
        retry: 0,                       // Never auto-retry mutations to prevent duplicate transactions
      },
    },
  });
}

/**
 * Composite root provider component wrapping Next.js layout children.
 *
 * @param props.children - Child React node tree.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  // Stable query client instance preserved across component re-renders
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={300}>
          {children}
        </TooltipProvider>
        {/* Global toast notification system */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            className: 'font-medium',
            duration: 5000,
          }}
        />
        {/* Top-of-screen slim navigation loading bar */}
        <ProgressBar
          height="3px"
          color="#2563eb"
          options={{ showSpinner: false }}
          shallowRouting
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
