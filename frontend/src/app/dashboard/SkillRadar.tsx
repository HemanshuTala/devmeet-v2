/**
 * @file SkillRadar.tsx
 * @description Five-Axis Competency Radar Chart Component for DevMeet Dashboard.
 *
 * Built on `recharts`:
 * - Projects candidate mastery across 5 key dimensions:
 *   1. DSA (Data Structures & Algorithms)
 *   2. Behavioral (STAR method, teamwork)
 *   3. System Design (Scalability, architecture)
 *   4. Communication (Clarity, articulation)
 *   5. Optimizations (Time/space complexity, resource tuning)
 * - Renders polar coordinate axes with SVG mesh grid and shaded area polygon.
 * - Displays calibration guidance note when total completed sessions are below 3.
 *
 * @module app/dashboard/SkillRadar
 */

'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

/**
 * Props accepted by SkillRadar.
 */
interface SkillRadarProps {
  /** Map of skill key to numeric proficiency score (0 to 100). */
  radarScores?: Record<string, number>;
  /** Alias for radarScores. */
  scores?: Record<string, number>;
  /** Total count of sessions completed by the candidate. */
  totalSessions?: number;
}

/**
 * SkillRadar Component.
 *
 * @component
 * @param {SkillRadarProps} props
 * @returns {JSX.Element} Spider/Radar chart card.
 */
export default function SkillRadar({ radarScores, scores, totalSessions = 0 }: SkillRadarProps) {
  const activeScores = radarScores || scores || {};
  const hasScores = Object.values(activeScores).some((val) => typeof val === 'number' && val > 0);

  // Formatted data array expected by Recharts RadarChart
  const data = [
    { subject: 'DSA', score: activeScores.dsa || 0, fullMark: 100 },
    { subject: 'Behavioral', score: activeScores.behavioral || 0, fullMark: 100 },
    { subject: 'System Design', score: activeScores.system_design || 0, fullMark: 100 },
    { subject: 'Communication', score: activeScores.communication || 0, fullMark: 100 },
    { subject: 'Optimizations', score: activeScores.optimizations || 0, fullMark: 100 },
  ];

  return (
    <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl p-6 flex flex-col gap-4 animate-fade-in-up delay-200">
      {/* Title */}
      <div>
        <h3 className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-blue-600" />
          Skill Radar
        </h3>
        <p className="text-slate-500 text-xs mt-0.5 font-medium">
          Evaluation rubric capability matrix
        </p>
      </div>

      {/* Responsive Recharts Radar Container */}
      <div className="h-64 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="subject" stroke="#64748b" fontSize={11} fontWeight={600} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              name="Skills"
              dataKey="score"
              stroke="#2563eb"
              fill="#3b82f6"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Baseline Calibration Notice */}
      {!hasScores ? (
        <p className="text-[10px] text-slate-400 font-medium text-center select-none">
          Complete mock interviews to populate your personalized skill radar.
        </p>
      ) : totalSessions < 3 ? (
        <p className="text-[10px] text-slate-400 font-medium text-center select-none">
          Calibrating from recent evaluations. Complete more sessions for higher precision.
        </p>
      ) : null}
    </div>
  );
}
