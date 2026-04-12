import { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  platform?: string;
  size?: 'default' | 'sm';
}

const platformAccents: Record<string, string> = {
  instagram: 'from-purple-500/10 via-pink-500/10 to-orange-400/10',
  tiktok:    'from-pink-500/10 to-cyan-400/10',
  youtube:   'from-red-600/10 to-red-400/10',
};

const platformIconColors: Record<string, string> = {
  instagram: 'text-pink-400',
  tiktok:    'text-cyan-400',
  youtube:   'text-red-400',
};

export default function MetricCard({
  label,
  value,
  subValue,
  positive,
  icon,
  loading,
  platform,
  size = 'default',
}: MetricCardProps) {
  const accentClass = platform ? platformAccents[platform] ?? '' : '';
  const iconColor = platform ? platformIconColors[platform] ?? 'text-zinc-400' : 'text-zinc-400';

  if (loading) {
    return (
      <div className="card p-4 space-y-2">
        <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
        <div className="h-7 w-16 bg-zinc-800 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`card card-hover p-4 ${accentClass ? `bg-gradient-to-br ${accentClass}` : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-zinc-400 font-medium ${size === 'sm' ? 'text-xs' : 'text-xs'}`}>
          {label}
        </p>
        {icon && (
          <span className={`flex-shrink-0 ${iconColor}`}>{icon}</span>
        )}
      </div>
      <p className={`font-bold text-white mt-1 tabular-nums ${size === 'sm' ? 'text-xl' : 'text-2xl'}`}>
        {value}
      </p>
      {subValue && (
        <p className={`text-xs mt-0.5 font-medium ${
          positive === true ? 'text-emerald-400' :
          positive === false ? 'text-red-400' : 'text-zinc-500'
        }`}>
          {subValue}
        </p>
      )}
    </div>
  );
}
