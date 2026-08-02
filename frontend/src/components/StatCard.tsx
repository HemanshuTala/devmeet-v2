import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'purple' | 'orange';
  change?: string;
  changePositive?: boolean;
}

const colorMap = {
  blue: {
    iconBg: '#eff6ff',
    iconColor: '#2563eb',
    iconBorder: '#bfdbfe',
    dot: '#2563eb',
  },
  green: {
    iconBg: '#f0fdf4',
    iconColor: '#16a34a',
    iconBorder: '#bbf7d0',
    dot: '#16a34a',
  },
  purple: {
    iconBg: '#f5f3ff',
    iconColor: '#7c3aed',
    iconBorder: '#ddd6fe',
    dot: '#7c3aed',
  },
  orange: {
    iconBg: '#fff7ed',
    iconColor: '#ea580c',
    iconBorder: '#fed7aa',
    dot: '#ea580c',
  },
};

export default React.memo(function StatCard({
  label,
  value,
  icon: Icon,
  color = 'blue',
  change,
  changePositive,
}: StatCardProps) {
  const c = colorMap[color];

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 12,
        padding: '20px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      className="hover:border-[#d0d0d0] hover:shadow-md cursor-default"
    >
      {/* Icon */}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: c.iconBg,
          border: `1px solid ${c.iconBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon style={{ width: 18, height: 18, color: c.iconColor }} />
      </div>

      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#999',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            margin: 0,
            lineHeight: 1,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#111',
            margin: '6px 0 0',
            lineHeight: 1,
            letterSpacing: '-0.03em',
          }}
        >
          {value}
        </p>
        {change && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              marginTop: 6,
              fontSize: 11,
              fontWeight: 600,
              color: changePositive ? '#16a34a' : '#dc2626',
              background: changePositive ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${changePositive ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 5,
              padding: '2px 7px',
            }}
          >
            <span>{changePositive ? '↑' : '↓'}</span>
            <span>{change}</span>
          </span>
        )}
      </div>
    </div>
  );
});
