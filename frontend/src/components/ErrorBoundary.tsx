/**
 * @file ErrorBoundary.tsx
 * @description React Class Error Boundary Component for DevMeet.
 *
 * Implements React's class component Error Boundary lifecycle (`getDerivedStateFromError` and `componentDidCatch`):
 * - Catches JavaScript runtime rendering errors anywhere in child component trees.
 * - Prevents unhandled errors from crashing the entire Next.js React application.
 * - Displays a user-friendly fallback recovery card with error details and a "Try Again" state reset button.
 * - Supports custom fallback UI override via the `fallback` prop.
 *
 * @module components/ErrorBoundary
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Props accepted by the ErrorBoundary component.
 */
interface Props {
  /** Child component subtree to protect against unhandled rendering errors. */
  children: ReactNode;
  /** Optional custom fallback component to display instead of the default error screen. */
  fallback?: ReactNode;
}

/**
 * Internal state for tracking error occurrences.
 */
interface State {
  /** Flag indicating whether a child component threw an unhandled error. */
  hasError: boolean;
  /** The caught Error instance, or null if healthy. */
  error: Error | null;
}

/**
 * Top-level and sectional React Error Boundary component.
 *
 * @class ErrorBoundary
 * @extends {Component<Props, State>}
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  /**
   * Static lifecycle invoked after an error has been thrown by a descendant component.
   * Updates state so the next render will display the fallback UI.
   *
   * @param {Error} error - The thrown exception.
   * @returns {State} New state with `hasError: true` and the error instance.
   */
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Lifecycle method called after an error has been caught.
   * Used for logging exceptions to error tracking telemetry services (e.g. Sentry, Datadog).
   *
   * @param {Error} error - The caught exception.
   * @param {ErrorInfo} errorInfo - Component stack trace trace information.
   */
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  /**
   * Resets the error boundary state to allow re-rendering of children.
   * Triggered when the user clicks the "Try Again" recovery button.
   */
  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  /**
   * Renders either the fallback UI (if an error occurred) or the regular children.
   *
   * @returns {ReactNode} Fallback card or child subtree.
   */
  public render() {
    if (this.state.hasError) {
      // Use caller-provided fallback UI if specified
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default DevMeet styled error recovery card
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="bg-white p-8 rounded-2xl border border-red-200 max-w-md w-full text-center shadow-lg">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-slate-900 font-bold text-lg mb-2">Something went wrong</h2>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
            </p>
            <button
              onClick={this.handleReset}
              className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
