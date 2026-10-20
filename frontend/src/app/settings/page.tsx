/**
 * @file frontend/src/app/settings/page.tsx
 * @description User Account Settings, Editor Preferences & Security Configuration Page.
 *
 * This client-side page provides users with full control over:
 * 1. **General Preferences**:
 *    - Email reminders for scheduled technical interview simulations.
 *    - Profile visibility (opt-in for recruiter search and talent discovery).
 * 2. **Code Editor Preferences**:
 *    - Theme selection (Light vs. Dark 'vs-dark').
 *    - Indentation settings (2 vs. 4 spaces).
 *    - Keybinding modes (Standard, Vim mode, or Emacs mode) stored in `localStorage`.
 * 3. **Security & Authentication Management**:
 *    - Multi-Factor Authentication (TOTP QR code pairing via `SecuritySection`).
 *    - Password changes with confirmation checks via `authApi.changePassword()`.
 * 4. **Privacy & Data Compliance (GDPR)**:
 *    - Complete data archive export as a downloadable JSON file.
 *    - Permanent account deletion with confirmation safeguards.
 *
 * Architectural Patterns:
 * - Employs `useRequireAuth()` for unauthenticated redirect enforcement.
 * - Utilizes React Query hooks (`useProfile`, `useUpdateProfile`) for optimistic caching and API sync.
 * - Manages tab switching between 'preferences' and 'security' without page reloads.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Shield, Lock, Laptop, CheckCircle, Save, Loader2, Key, Download, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useProfile, useUpdateProfile } from '@/hooks/queries/useUser';
import { PageLoader } from '@/components/feedback/PageLoader';
import { toast } from 'sonner';
import { userApi, authApi, UserProfile } from '@/lib/api';
import DashboardShell from '@/components/layout/DashboardShell';
import ToggleSwitch from '@/components/ToggleSwitch';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { Button } from '@/components/ui/button';

/**
 * SettingsPage Component
 *
 * Renders the top-level account preferences, code editor customizer,
 * MFA controls, password reset form, and GDPR compliance actions.
 *
 * @returns {JSX.Element} The rendered settings dashboard view
 */
export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, refreshUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Settings states for notifications and privacy
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [profilePublic, setProfilePublic] = useState(false);

  // Settings states for Monaco code editor customization
  const [editorTheme, setEditorTheme] = useState<'light' | 'vs-dark'>('light');
  const [editorTabSize, setEditorTabSize] = useState<2 | 4>(4);
  const [editorKeybindings, setEditorKeybindings] = useState<'standard' | 'vim' | 'emacs'>('standard');

  // UI status tracking states
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Password update form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // GDPR action loaders
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Authentication requirement hook (redirects unauthenticated guests to /login)
  const { isLoading: authGuardLoading } = useRequireAuth();

  // Profile data fetch and mutation queries via TanStack React Query
  const { data: profileData, isLoading: profileLoading, isError: profileError } = useProfile();
  const updateProfileMutation = useUpdateProfile();

  // Active navigation tab ('preferences' vs 'security')
  const [activeTab, setActiveTab] = useState<'preferences' | 'security'>('preferences');

  /**
   * Synchronize local state with fetched profile data and retrieve stored editor preferences.
   * Runs whenever profileData changes or when component mounts on client side.
   */
  useEffect(() => {
    // If fetching profile fails, stop loading spinner and render error view
    if (profileError) {
      setLoading(false);
      return;
    }
    if (!profileData) return;

    // Populate remote profile preferences
    setProfile(profileData);
    setReminderEnabled(profileData.interview_reminder_enabled ?? false);
    setProfilePublic(profileData.profile_public ?? false);
    setLoading(false);

    // Read stored code editor preferences from client's browser localStorage
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('devmeet_editor_theme') as 'light' | 'vs-dark';
      const tabSize = Number(localStorage.getItem('devmeet_editor_tab_size'));
      const keybindings = localStorage.getItem('devmeet_editor_keybindings') as 'standard' | 'vim' | 'emacs';
      if (theme) setEditorTheme(theme);
      if (tabSize === 2 || tabSize === 4) setEditorTabSize(tabSize);
      if (keybindings) setEditorKeybindings(keybindings);
    }
  }, [profileData, profileError]);

  /**
   * Persists both remote profile preferences to the backend API and
   * code editor preferences to browser localStorage.
   */
  const handleSaveSettings = async () => {
    setSaving(true);
    setSuccessMsg('');
    try {
      // 1. Dispatch profile preference updates to the backend User Microservice
      const updated = await updateProfileMutation.mutateAsync({
        interview_reminder_enabled: reminderEnabled,
        profile_public: profilePublic,
      });
      setProfile(updated);

      // 2. Persist code editor settings to browser local storage for Monaco Editor consumption
      localStorage.setItem('devmeet_editor_theme', editorTheme);
      localStorage.setItem('devmeet_editor_tab_size', String(editorTabSize));
      localStorage.setItem('devmeet_editor_keybindings', editorKeybindings);

      // 3. Display success toast banner and auto-dismiss after 3 seconds
      setSuccessMsg('Settings saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setSuccessMsg('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Submits a password update request after validating matching passwords and minimum length.
   *
   * @param {React.FormEvent} e - Form submission event
   */
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Ensure new password and confirm password inputs match
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    // Ensure new password meets minimal length criteria
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    setUpdatingPassword(true);
    try {
      // Call Auth microservice to verify current credentials and apply new password hash
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Password changed successfully!');

      // Reset form fields upon successful update
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password.';
      setPasswordError(msg);
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Render full-page loading spinner while authenticating user session
  if (authLoading || authGuardLoading) {
    return <PageLoader label="Loading settings…" />;
  }

  // Render dashboard layout with loader while initial profile query is in-flight
  if (loading || profileLoading) {
    return (
      <DashboardShell maxWidth="max-w-4xl">
        <PageLoader label="Loading settings…" />
      </DashboardShell>
    );
  }

  // Render fallback card if profile fails to load
  if (profileError || !profile) {
    return (
      <DashboardShell maxWidth="max-w-4xl">
        <div className="bg-white p-8 rounded-2xl border border-rose-200 max-w-md mx-auto text-center shadow-lg my-12">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-slate-900 font-bold text-lg mb-2">Failed to Load Settings</h2>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            Could not retrieve your profile configuration. Please make sure the service is online.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold w-full"
          >
            Back to Dashboard
          </button>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell maxWidth="max-w-4xl">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900 gradient-text">Settings</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Manage your account preferences, system settings, and security credentials.
          </p>
        </div>

        {/* Global Feedback Alert Banner */}
        {successMsg && (
          <div className="alert-success text-sm font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {successMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left panel: General account overview & Tab navigation buttons */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
              <h2 className="text-slate-800 font-bold text-sm mb-3">General Details</h2>
              <div className="space-y-2 text-xs text-slate-550 font-medium">
                <p>Plan Tier: <strong className="text-blue-600 uppercase">{profile?.bio === 'DevMeet Pro Member' ? 'Pro' : 'Free'}</strong></p>
                <p>Email: <strong>{profile?.email}</strong></p>
                <p>Display Name: <strong>{profile?.display_name}</strong></p>
              </div>
            </div>

            {/* Sidebar Tab Selector */}
            <div className="bg-white border border-slate-100 p-3 rounded-2xl shadow-sm flex flex-col gap-1.5">
              <button
                onClick={() => setActiveTab('preferences')}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                  activeTab === 'preferences'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Laptop className="w-4 h-4 shrink-0" />
                Preferences
              </button>
              <button
                onClick={() => setActiveTab('security')}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                  activeTab === 'security'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-650 hover:bg-slate-50'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                Security & Privacy
              </button>
            </div>
          </div>

          {/* Right panel: Active Tab Content */}
          <div className="md:col-span-2 space-y-6">
            {activeTab === 'preferences' && (
              <>
                {/* Notification & Visibility Toggles */}
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-600" />
                    Notification & Privacy
                  </h3>
                  <div className="space-y-3">
                    <ToggleSwitch
                      id="reminders"
                      checked={reminderEnabled}
                      onChange={setReminderEnabled}
                      label="Interview Reminders"
                      description="Receive email alerts before your scheduled technical practices"
                      icon={<Bell className="w-5 h-5" />}
                    />
                    <ToggleSwitch
                      id="public"
                      checked={profilePublic}
                      onChange={setProfilePublic}
                      label="Public Stats Radar"
                      description="Allow recruiters to search for your anonymized capability matrices"
                      icon={<Shield className="w-5 h-5" />}
                    />
                  </div>
                </div>

                {/* Code Editor Configuration (Monaco Editor theme, indent, keybindings) */}
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-blue-600" />
                    Code Editor Preferences
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Theme selector */}
                    <div>
                      <label className="form-label font-bold text-slate-700" htmlFor="theme">Editor Theme</label>
                      <select
                        id="theme"
                        value={editorTheme}
                        onChange={(e) => setEditorTheme(e.target.value as 'light' | 'vs-dark')}
                        className="input-field w-full outline-none mt-1 cursor-pointer font-semibold text-sm"
                      >
                        <option value="light">Light Theme</option>
                        <option value="vs-dark">Dark Theme</option>
                      </select>
                    </div>

                    {/* Tab spacing selector */}
                    <div>
                      <label className="form-label font-bold text-slate-700" htmlFor="tabSize">Tab Spaces</label>
                      <select
                        id="tabSize"
                        value={editorTabSize}
                        onChange={(e) => setEditorTabSize(Number(e.target.value) as 2 | 4)}
                        className="input-field w-full outline-none mt-1 cursor-pointer font-semibold text-sm"
                      >
                        <option value={2}>2 Spaces</option>
                        <option value={4}>4 Spaces</option>
                      </select>
                    </div>

                    {/* Keybinding scheme selector */}
                    <div>
                      <label className="form-label font-bold text-slate-700" htmlFor="keybindings">Keybindings</label>
                      <select
                        id="keybindings"
                        value={editorKeybindings}
                        onChange={(e) => setEditorKeybindings(e.target.value as 'standard' | 'vim' | 'emacs')}
                        className="input-field w-full outline-none mt-1 cursor-pointer font-semibold text-sm"
                      >
                        <option value="standard">Standard</option>
                        <option value="vim">Vim Mode</option>
                        <option value="emacs">Emacs Mode</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Save Preferences Button */}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    variant="gradient"
                    className="flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Save Settings
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {activeTab === 'security' && (
              <>
                {/* Security Section: Multi-Factor Authentication (MFA) & Email verification */}
                <SecuritySection />

                {/* Privacy & Data Compliance (GDPR) */}
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    Privacy & Data (GDPR)
                  </h3>
                  <p className="text-sm text-slate-500">
                    Export your data or permanently delete your account. Deletion is irreversible.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {/* Export My Data Button */}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exportingData}
                      onClick={async () => {
                        setExportingData(true);
                        try {
                          const blob = await userApi.exportData();
                          // Create temporary Object URL for downloading the file
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `devmeet-data-export-${Date.now()}.json`;
                          a.click();
                          // Clean up object URL from memory
                          URL.revokeObjectURL(url);
                          setSuccessMsg('Data export downloaded.');
                        } catch {
                          setSuccessMsg('Failed to export data.');
                        } finally {
                          setExportingData(false);
                        }
                      }}
                      className="flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-semibold border-slate-200 text-slate-650 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-800 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu"
                    >
                      {exportingData ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 text-slate-500 mr-1" />}
                      Export My Data
                    </Button>

                    {/* Delete Account Button */}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deletingAccount}
                      onClick={async () => {
                        // Request user confirmation before invoking irreversible account deletion
                        if (!confirm('Delete your account permanently? This cannot be undone.')) return;
                        setDeletingAccount(true);
                        try {
                          await userApi.deleteAccount();
                          router.push('/login');
                        } catch {
                          setSuccessMsg('Account deletion failed.');
                          setDeletingAccount(false);
                        }
                      }}
                      className="flex items-center gap-2 px-5 h-10 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu"
                    >
                      {deletingAccount ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                      Delete Account
                    </Button>
                  </div>
                </div>

                {/* Change Account Password Form */}
                <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-slate-900 font-bold text-base flex items-center gap-2">
                    <Lock className="w-4 h-4 text-blue-600" />
                    Change Account Password
                  </h3>
                  
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    {/* Error & Success Feedback alerts */}
                    {passwordError && <div className="alert-error text-sm font-semibold">{passwordError}</div>}
                    {passwordSuccess && <div className="alert-success text-sm font-semibold">{passwordSuccess}</div>}

                    {/* Current password input */}
                    <div>
                      <label className="form-label font-bold text-slate-700" htmlFor="currentPassword">Current Password</label>
                      <input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="input-field w-full mt-1"
                        placeholder="Enter current password"
                        required
                      />
                    </div>

                    {/* New password & Confirm password inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="form-label font-bold text-slate-700" htmlFor="newPassword">New Password</label>
                        <input
                          id="newPassword"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="input-field w-full mt-1"
                          placeholder="At least 8 characters"
                          required
                        />
                      </div>
                      <div>
                        <label className="form-label font-bold text-slate-700" htmlFor="confirmPassword">Confirm Password</label>
                        <input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="input-field w-full mt-1"
                          placeholder="Confirm new password"
                          required
                        />
                      </div>
                    </div>

                    {/* Submit password update */}
                    <div className="flex justify-end pt-2">
                      <Button
                        type="submit"
                        disabled={updatingPassword}
                        variant="gradient"
                        className="flex items-center gap-2 px-6 h-10 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 transform-gpu"
                      >
                        {updatingPassword ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            Updating…
                          </>
                        ) : (
                          <>
                            <Key className="w-4 h-4 mr-1" />
                            Update Password
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
