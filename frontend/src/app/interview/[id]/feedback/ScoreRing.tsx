'use client';

/**
 * @file ScoreRing.tsx (Animated Circular SVG Score Visualizer)
 * @description Renders a circular progress ring animating from 0% to the final score
 * using cubic easing (`1 - (1 - progress)^3`) over 1200ms.
 * SVG stroke-dashoffset formulas control the filled perimeter of the ring.
 * Used across the scorecard page for Technical Score, Communication, and Problem Solving.
 */

import React, { useEffect, useState } from 'react';

/**
 * Props passed to ScoreRing.
 */
interface ScoreRingProps {
  /** Target percentage score (0 to 100) */
  score: number;
  /** Dimension label under the ring (e.g. "Overall Score", "Technical") */
  label: string;
  /** Foreground stroke color (hex or tailwind color value) */
  color: string;
  /** Background track ring color */
  trackColor: string;
  /** Diameter of the SVG canvas in pixels (defaults to 128px) */
  size?: number;
}

/**
 * ScoreRing Component.
 */
export default function ScoreRing({ score, label, color, trackColor, size = 128 }: ScoreRingProps) {
  // Current animated score number in 0-100 range
  const [animated, setAnimated] = useState(0);

  // SVG Geometry calculations
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Offset controls how much of the dasharray is hidden
  const offset = circumference - (animated / 100) * circumference;

  /**
   * Animation Effect:
   * Uses requestAnimationFrame to interpolate smoothly between 0 and the final score
   * applying a cubic ease-out transition.
   */
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1200;

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // Cubic ease-out formula
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimated(Math.round(score * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        {/*
         * Rotated -90deg so the circular stroke begins at 12 o'clock (top)
         * rather than 3 o'clock (default SVG orientation).
         */}
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track circle */}
          <circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          {/* Foreground progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>

        {/* Centered animated percentage number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black" style={{ color }}>
            {animated}%
          </span>
        </div>
      </div>

      {/* Metric title caption */}
      <span className="text-xs font-bold text-slate-600">{label}</span>
    </div>
  );
}
