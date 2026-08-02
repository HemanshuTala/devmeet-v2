'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

interface SkillRadarProps {
  radarScores: Record<string, number>;
  totalSessions: number;
}

export default function SkillRadar({ radarScores, totalSessions }: SkillRadarProps) {
  const data = [
    { subject: 'DSA', score: radarScores.dsa ?? 50, fullMark: 100 },
    { subject: 'Behavioral', score: radarScores.behavioral ?? 50, fullMark: 100 },
    { subject: 'System Design', score: radarScores.system_design ?? 50, fullMark: 100 },
    { subject: 'Communication', score: radarScores.communication ?? 50, fullMark: 100 },
    { subject: 'Optimizations', score: radarScores.optimizations ?? 50, fullMark: 100 },
  ];

  return (
    <div className="bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200/60 transition-all duration-200 rounded-2xl p-6 flex flex-col gap-4 animate-fade-in-up delay-200">
      <div>
        <h3 className="text-slate-900 font-bold text-lg flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-blue-600" />
          Skill Radar
        </h3>
        <p className="text-slate-500 text-xs mt-0.5 font-medium">
          Automated mock capability matrix
        </p>
      </div>

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
      {totalSessions < 3 && (
        <p className="text-[9px] text-slate-500 italic text-center select-none">
          * Showing calibration baseline. Complete more sessions to calibrate.
        </p>
      )}
    </div>
  );
}
