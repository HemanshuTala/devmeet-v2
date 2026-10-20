'use client';

/**
 * @file ProfileTab.tsx (Personal Information & Skills Profile Tab)
 * @description Candidate profile view and edit screen.
 * Supports viewing and updating:
 * - Display Name
 * - Bio synopsis
 * - Skills tags list (`TagInput`)
 * - Target Companies wishlist (`TagInput`)
 * Includes optimistic editing state, cancellation rollback, and loading spinners during commit.
 */

import React from 'react';
import { User, Edit2, X, Save } from 'lucide-react';
import TagInput from '@/components/TagInput';
import ReadonlyField from '@/components/ReadonlyField';

/**
 * Props passed to ProfileTab component.
 */
interface ProfileTabProps {
  isEditing: boolean;
  displayName: string;
  setDisplayName: (val: string) => void;
  bio: string;
  setBio: (val: string) => void;
  skills: string[];
  setSkills: (tags: string[]) => void;
  targetCompanies: string[];
  setTargetCompanies: (tags: string[]) => void;
  isSaving: boolean;
  handleSaveProfile: () => void;
  handleCancelEdit: () => void;
  setIsEditing: (val: boolean) => void;
}

/**
 * ProfileTab Component.
 */
export default function ProfileTab({
  isEditing,
  displayName,
  setDisplayName,
  bio,
  setBio,
  skills,
  setSkills,
  targetCompanies,
  setTargetCompanies,
  isSaving,
  handleSaveProfile,
  handleCancelEdit,
  setIsEditing,
}: ProfileTabProps) {
  return (
    <div className="bg-white border border-blue-100 p-6 rounded-2xl shadow-sm animate-fade-in-up">
      {/* ── Section Header & Edit / Save Toolbar ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Personal Information</h3>
          <p className="text-sm text-slate-500 mt-0.5 font-medium">
            {isEditing ? 'Make your changes below and save' : 'View and edit your profile details'}
          </p>
        </div>

        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="btn-ghost flex items-center gap-2 text-sm font-bold cursor-pointer"
          >
            <Edit2 className="h-4 w-4" />
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancelEdit}
              className="btn-ghost flex items-center gap-1.5 text-sm font-bold cursor-pointer"
              disabled={isSaving}
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
            <button
              onClick={handleSaveProfile}
              className="btn-primary flex items-center gap-1.5 text-sm font-bold cursor-pointer"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Profile Input Fields ── */}
      <div className="space-y-5">
        {/* Display Name */}
        <div>
          <label className="form-label font-bold text-slate-700" htmlFor="displayName">
            Display Name
          </label>
          {isEditing ? (
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-field w-full"
              placeholder="Your display name"
              maxLength={64}
            />
          ) : (
            <ReadonlyField
              value={displayName || '—'}
              icon={<User className="h-4 w-4" />}
            />
          )}
        </div>

        {/* Bio */}
        <div>
          <label className="form-label font-bold text-slate-700" htmlFor="bio">
            Bio
          </label>
          {isEditing ? (
            <textarea
              id="bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="input-field w-full resize-none"
              placeholder="Tell the community a bit about yourself…"
              maxLength={300}
            />
          ) : (
            <ReadonlyField value={bio || 'No bio added yet.'} />
          )}
        </div>

        {/* Skills Tag List */}
        <div>
          <label className="form-label font-bold text-slate-700">
            Skills
            <span className="ml-1 text-slate-400 font-normal text-xs">(press Enter or , to add)</span>
          </label>
          {isEditing ? (
            <TagInput
              tags={skills}
              onChange={setSkills}
              placeholder="e.g. React, Python, System Design…"
              disabled={false}
              colorClass="badge-cyan"
            />
          ) : (
            <div className="flex flex-wrap gap-2 min-h-[36px]">
              {skills.length > 0 ? (
                skills.map((s) => (
                  <span key={s} className="badge-cyan text-xs">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400 italic font-medium">No skills added yet.</span>
              )}
            </div>
          )}
        </div>

        {/* Target Companies Tag List */}
        <div>
          <label className="form-label font-bold text-slate-700">
            Target Companies
            <span className="ml-1 text-slate-400 font-normal text-xs">(press Enter or , to add)</span>
          </label>
          {isEditing ? (
            <TagInput
              tags={targetCompanies}
              onChange={setTargetCompanies}
              placeholder="e.g. Google, Meta, Stripe…"
              disabled={false}
              colorClass="badge-blue"
            />
          ) : (
            <div className="flex flex-wrap gap-2 min-h-[36px]">
              {targetCompanies.length > 0 ? (
                targetCompanies.map((c) => (
                  <span key={c} className="badge-blue text-xs">
                    {c}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400 italic font-medium">No target companies added yet.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
