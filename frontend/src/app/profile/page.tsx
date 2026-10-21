'use client';

/**
 * @file page.tsx (Candidate Profile Management Page)
 * @description Central profile hub for authenticated candidates.
 * Architecture:
 * - Left column: Permanent Identity Card (avatar upload with S3 storage, member since date, account status,
 *   subscription badge, skills preview, quote).
 * - Right column: Tab-driven sub-views:
 *   1. `ProfileTab`: Display name, bio, skills, and target companies with inline edit mode.
 *   2. `PreferencesTab`: Notification toggles, public leaderboard discovery, password change form.
 *   3. `BillingTab`: Subscription tier details, feature comparisons, and Stripe checkout CTA.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Calendar, User, Shield, X, Camera, Loader2, Settings, CreditCard, Sparkles } from 'lucide-react';
import { authApi, userApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile, usePlan, useUpdateProfile } from '@/hooks/queries/useUser';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { toast as sonnerToast } from 'sonner';
import DashboardShell from '@/components/layout/DashboardShell';
import ProfileTab from './ProfileTab';
import PreferencesTab from './PreferencesTab';
import BillingTab from './BillingTab';

/**
 * Returns candidate initial monogram for avatar fallback.
 *
 * @param name - Candidate display name or email
 * @returns Single uppercase letter
 */
function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase();
}

/**
 * Formats account registration date into readable English (e.g., "October 24, 2026").
 *
 * @param dateStr - Raw ISO date string
 */
function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * ProfilePage Component.
 */
export default function ProfilePage() {
  const { user, isLoading: authLoading, refreshUser } = useAuth();

  // ── Profile State ──
  const [profile, setProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'billing'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // TanStack React Query mutations & cache hooks
  const { data: planData } = usePlan();
  const updateProfileMutation = useUpdateProfile();

  // Controlled form states
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [targetCompanies, setTargetCompanies] = useState<string[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [profilePublic, setProfilePublic] = useState(false);

  // Password update form states
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Enforce route authentication
  useRequireAuth();

  /**
   * Hydrates controlled form fields from profile response.
   */
  const populateForm = useCallback((p: any) => {
    setDisplayName(p?.display_name ?? '');
    setBio(p?.bio ?? '');
    setSkills(p?.skills ?? []);
    setTargetCompanies(p?.target_companies ?? []);
    setReminderEnabled(p?.interview_reminder_enabled ?? false);
    setProfilePublic(p?.profile_public ?? false);
  }, []);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  }, []);

  const { data: profileData, isLoading: profileQueryLoading } = useProfile();

  useEffect(() => {
    if (profileData) {
      setProfile(profileData);
      populateForm(profileData);
      setIsLoadingProfile(false);
    }
  }, [profileData, populateForm]);

  // Toast alert dismiss timer
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /**
   * Cancels edit mode and resets form inputs back to current saved profile values.
   */
  function handleCancelEdit() {
    if (profile) populateForm(profile);
    setIsEditing(false);
  }

  /**
   * Saves updated personal details (name, bio, skills, target companies) to User Service.
   */
  async function handleSaveProfile() {
    if (!displayName.trim()) {
      showToast('error', 'Display name cannot be empty.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        display_name: displayName.trim(),
        bio: bio.trim() || undefined,
        skills,
        target_companies: targetCompanies,
        interview_reminder_enabled: reminderEnabled,
        profile_public: profilePublic,
      };
      const updated = await updateProfileMutation.mutateAsync(payload);
      setProfile(updated);
      setIsEditing(false);
      sonnerToast.success('Profile updated!');
    } catch {
      showToast('error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Commits partial preference updates (reminders or public toggle) without entering edit mode.
   */
  async function handlePreferenceSave(patch: any) {
    try {
      const updated = await updateProfileMutation.mutateAsync(patch);
      setProfile(updated);
      sonnerToast.success('Preferences saved!');
    } catch {
      showToast('error', 'Failed to save preferences.');
    }
  }

  /**
   * Uploads candidate avatar image to User / File microservice.
   * Enforces 5MB size limit and image/jpeg, image/png, image/webp MIME types.
   */
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('error', 'Please upload a JPEG or PNG image (max 5MB).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('error', 'Image must be under 5MB.');
      return;
    }

    setAvatarUploading(true);
    try {
      const { avatar_url } = await userApi.uploadAvatar(file);
      setProfile((p: any) => (p ? { ...p, avatar_url } : p));
      await refreshUser();
      sonnerToast.success('Avatar updated successfully');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  }

  /**
   * Handles password change submission with client-side length and equality validation.
   */
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    try {
      await authApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordSuccess('Password changed successfully!');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to change password.';
      setPasswordError(msg);
    }
  }

  const currentPlan = planData?.plan ?? 'free';

  // Loading skeleton during query resolution
  if (authLoading || isLoadingProfile || profileQueryLoading) {
    return (
      <DashboardShell maxWidth="max-w-6xl">
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Skeleton Header */}
          <div
            className="rounded-2xl p-8 border flex flex-col sm:flex-row items-start sm:items-center gap-6"
            style={{
              background: 'var(--color-bg-card)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="skeleton-shimmer w-20 h-20 rounded-full flex-shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="skeleton-shimmer h-6 w-48 rounded-md" />
              <div className="skeleton-shimmer h-4 w-60 rounded-md" />
              <div className="skeleton-shimmer h-3 w-36 rounded-md" />
            </div>
            <div className="skeleton-shimmer h-9 w-28 rounded-lg flex-shrink-0" />
          </div>

          {/* Skeleton Tabs */}
          <div className="flex gap-2">
            {[24, 28, 28].map((w, i) => (
              <div key={i} className="skeleton-shimmer h-9 rounded-lg" style={{ width: w * 4 }} />
            ))}
          </div>

          {/* Skeleton Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[0, 1].map((j) => (
              <div
                key={j}
                className="rounded-2xl p-6 border flex flex-col gap-4"
                style={{
                  background: 'var(--color-bg-card)',
                  borderColor: 'var(--color-border)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div className="skeleton-shimmer h-5 w-36 rounded-md" />
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} className="flex items-center justify-between py-1">
                    <div className="skeleton-shimmer h-4 w-28 rounded-md" />
                    <div className="skeleton-shimmer h-4 w-44 rounded-md" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </DashboardShell>
    );
  }

  if (!user || !profile) return null;

  const memberSince = formatDate(profile.created_at);
  const displayPlanLabel = currentPlan.toUpperCase() + ' PLAN';

  return (
    <DashboardShell maxWidth="max-w-6xl">
      {/* Toast Alert Popover */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-5 py-3 shadow-2xl backdrop-blur-md animate-fade-in-up font-semibold text-sm ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {toast.type === 'success' ? (
            <Shield className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          ) : (
            <X className="h-4 w-4 flex-shrink-0 text-rose-600" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold gradient-text">My Profile</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">
          Manage your identity, preferences, and subscription.
        </p>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left Column: Identity Card ── */}
        <div className="lg:col-span-1 animate-fade-in-up delay-100">
          <div className="bg-white border border-blue-100 p-6 rounded-2xl shadow-sm flex flex-col items-center text-center gap-4">
            {/* Avatar container with hover camera icon for upload */}
            <div className="relative group">
              <div className="h-24 w-24 rounded-full bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-200/50 ring-4 ring-blue-50 overflow-hidden">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name ?? 'Avatar'}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-extrabold text-white select-none">
                    {getInitials(profile.display_name)}
                  </span>
                )}
              </div>
              <label
                htmlFor="avatar-upload"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {avatarUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white" />
                )}
              </label>
              <input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={avatarUploading}
                onChange={handleAvatarUpload}
              />
              <div className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-emerald-400 ring-2 ring-white shadow" />
            </div>

            {/* Display Name & Email */}
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {profile.display_name ?? 'Anonymous'}
              </h2>
              <div className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-500 font-medium">
                <Mail className="h-3.5 w-3.5" />
                <span>{profile.email}</span>
              </div>
            </div>

            {/* Subscription badge */}
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border inline-flex items-center gap-1 ${
                currentPlan === 'pro'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : currentPlan === 'enterprise'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-current" />
              <span>{displayPlanLabel}</span>
            </span>

            <div className="w-full h-px bg-blue-50" />

            {/* Metadata summary (registration date & active status) */}
            <div className="w-full grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-blue-50 bg-slate-50 p-3">
                <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1 select-none">
                  <Calendar className="h-3.5 w-3.5 text-blue-400" />
                  Member
                </div>
                <p className="text-sm font-bold text-slate-800 leading-tight">{memberSince}</p>
              </div>
              <div className="rounded-xl border border-blue-50 bg-slate-50 p-3">
                <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1 select-none">
                  <User className="h-3.5 w-3.5 text-sky-400" />
                  Status
                </div>
                <p className="text-sm font-bold text-emerald-600">Active</p>
              </div>
            </div>

            {/* Bio quote */}
            {profile.bio && (
              <>
                <div className="w-full h-px bg-blue-50" />
                <p className="text-sm text-slate-500 italic leading-relaxed">&ldquo;{profile.bio}&rdquo;</p>
              </>
            )}

            {/* Skills tag pills preview */}
            {(profile.skills ?? []).length > 0 && (
              <>
                <div className="w-full h-px bg-blue-50" />
                <div className="w-full flex flex-wrap gap-1.5 justify-center">
                  {(profile.skills ?? []).slice(0, 6).map((s: string) => (
                    <span key={s} className="badge-cyan text-xs">
                      {s}
                    </span>
                  ))}
                  {(profile.skills ?? []).length > 6 && (
                    <span className="badge-blue text-xs">
                      +{(profile.skills ?? []).length - 6} more
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Right Column: Tab View ── */}
        <div className="lg:col-span-2 animate-fade-in-up delay-200">
          {/* Tab Selection Header */}
          <div className="flex gap-1 rounded-xl border border-blue-100 bg-white p-1 mb-5 shadow-sm">
            {[
              { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
              { id: 'preferences', label: 'Preferences', icon: <Settings className="w-4 h-4" /> },
              { id: 'billing', label: 'Billing', icon: <CreditCard className="w-4 h-4" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as 'profile' | 'preferences' | 'billing');
                  if (isEditing) handleCancelEdit();
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Active Tab View */}
          {activeTab === 'profile' && (
            <ProfileTab
              isEditing={isEditing}
              displayName={displayName}
              setDisplayName={setDisplayName}
              bio={bio}
              setBio={setBio}
              skills={skills}
              setSkills={setSkills}
              targetCompanies={targetCompanies}
              setTargetCompanies={setTargetCompanies}
              isSaving={isSaving}
              handleSaveProfile={handleSaveProfile}
              handleCancelEdit={handleCancelEdit}
              setIsEditing={setIsEditing}
            />
          )}

          {activeTab === 'preferences' && (
            <PreferencesTab
              reminderEnabled={reminderEnabled}
              setReminderEnabled={setReminderEnabled}
              profilePublic={profilePublic}
              setProfilePublic={setProfilePublic}
              handlePreferenceSave={handlePreferenceSave}
              passwordForm={passwordForm}
              setPasswordForm={setPasswordForm}
              passwordError={passwordError}
              passwordSuccess={passwordSuccess}
              handleChangePassword={handleChangePassword}
            />
          )}

          {activeTab === 'billing' && (
            <BillingTab plan={currentPlan} showToast={showToast} />
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
