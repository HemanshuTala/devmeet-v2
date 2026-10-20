import React from 'react';
import { Bell, Eye, Lock } from 'lucide-react';
import ToggleSwitch from '@/components/ToggleSwitch';

/**
 * @file PreferencesTab.tsx (Account Preferences & Security Form Tab)
 * @description Candidate settings tab managing:
 * 1. Notifications & Privacy (email reminders before mock interviews, public leaderboard discovery toggle).
 * 2. Password Change Form (current password verification, new password entry, and confirmation matching).
 */

/**
 * State container for password updates.
 */
interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Props passed to PreferencesTab.
 */
interface PreferencesTabProps {
  /** Whether upcoming mock interview email reminders are enabled */
  reminderEnabled: boolean;
  /** State setter for reminder toggle */
  setReminderEnabled: (v: boolean) => void;
  /** Whether user profile is visible on community leaderboards */
  profilePublic: boolean;
  /** State setter for public profile toggle */
  setProfilePublic: (v: boolean) => void;
  /** Callback committing preference changes to User Service */
  handlePreferenceSave: (patch: { interview_reminder_enabled?: boolean; profile_public?: boolean }) => void;
  /** Password update form fields state */
  passwordForm: PasswordForm;
  /** State setter for password update fields */
  setPasswordForm: React.Dispatch<React.SetStateAction<PasswordForm>>;
  /** Password change error message */
  passwordError: string;
  /** Password change success message */
  passwordSuccess: string;
  /** Form submission handler for password updates */
  handleChangePassword: (e: React.FormEvent) => void;
}

/**
 * PreferencesTab Component.
 */
export default function PreferencesTab({
  reminderEnabled,
  setReminderEnabled,
  profilePublic,
  setProfilePublic,
  handlePreferenceSave,
  passwordForm,
  setPasswordForm,
  passwordError,
  passwordSuccess,
  handleChangePassword,
}: PreferencesTabProps) {
  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* ── Notifications & Privacy Toggles ── */}
      <div className="bg-white border border-blue-100 p-6 rounded-2xl shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Notifications & Privacy</h3>
        <p className="text-sm text-slate-500 font-medium mb-5">
          Control how DevMeet communicates with you
        </p>
        <div className="space-y-3">
          {/* Email reminders toggle */}
          <ToggleSwitch
            id="reminders"
            checked={reminderEnabled}
            onChange={async (v) => {
              setReminderEnabled(v);
              handlePreferenceSave({ interview_reminder_enabled: v });
            }}
            label="Interview Reminders"
            description="Get email reminders before scheduled mock interviews"
            icon={<Bell className="h-5 w-5" />}
          />
          {/* Public leaderboard visibility toggle */}
          <ToggleSwitch
            id="publicProfile"
            checked={profilePublic}
            onChange={async (v) => {
              setProfilePublic(v);
              handlePreferenceSave({ profile_public: v });
            }}
            label="Public Profile"
            description="Allow other users to discover and view your profile"
            icon={<Eye className="h-5 w-5" />}
          />
        </div>
      </div>

      {/* ── Security & Password Update Form ── */}
      <div className="bg-white border border-blue-100 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-bold text-slate-900">Change Password</h3>
        </div>
        <p className="text-sm text-slate-500 font-medium mb-5">
          Update your password to keep your account secure
        </p>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordError && <div className="alert-error text-sm font-semibold">{passwordError}</div>}
          {passwordSuccess && (
            <div className="alert-success text-sm font-semibold">{passwordSuccess}</div>
          )}

          {/* Current password */}
          <div>
            <label className="form-label font-bold text-slate-700" htmlFor="currentPassword">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
              }
              className="input-field w-full"
              placeholder="Enter your current password"
              autoComplete="current-password"
            />
          </div>

          {/* New password */}
          <div>
            <label className="form-label font-bold text-slate-700" htmlFor="newPassword">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
              className="input-field w-full"
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>

          {/* Confirm new password */}
          <div>
            <label className="form-label font-bold text-slate-700" htmlFor="confirmPassword">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
              }
              className="input-field w-full"
              placeholder="Repeat your new password"
              autoComplete="new-password"
            />
          </div>

          {/* Update submit button */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="btn-primary flex items-center gap-2 text-sm font-bold cursor-pointer"
              disabled={
                !passwordForm.currentPassword ||
                !passwordForm.newPassword ||
                !passwordForm.confirmPassword
              }
            >
              <Lock className="h-4 w-4" />
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
