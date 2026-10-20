/**
 * ============================================================================
 * DevMeet Frontend - Global UI State Store (Zustand)
 * ============================================================================
 * Manages responsive layout preferences, sidebar collapsible states, and persistent
 * UI options across navigation sessions.
 *
 * Key Capabilities:
 * 1. Persistent State (`persist` middleware):
 *    - Persists user preferences (`devmeet-ui` key in localStorage) so that
 *      sidebar expansion/collapse states survive page reloads and tab navigations.
 * 2. Predictable State Mutations:
 *    - `setSidebarCollapsed`: Explicit boolean override.
 *    - `toggleSidebar`: Toggles current collapse state (expanded <-> collapsed).
 * ============================================================================
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Interface defining the reactive UI state shape and mutation actions.
 */
interface UIState {
  /** Whether navigation sidebar is currently collapsed to icon-only mode */
  sidebarCollapsed: boolean;
  /** Explicit setter for sidebar collapse state */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Toggles sidebar between collapsed and expanded representations */
  toggleSidebar: () => void;
}

/**
 * Zustand hook providing reactive access and local-storage persistence for global UI state.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'devmeet-ui' }
  )
);
