import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon?: ReactNode;
  accent?: string;   // tailwind bg class e.g. 'bg-purple-500/10'
}

export default function MetricCard({ label, value, sub, positive, icon, accent }: MetricCardProps) {
  return (
    <div className={`card p-4 flex flex-col gap-1 ${accent ?? ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</span>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums leading-tight">{value}</p>
      {sub && (
        <p className={`text-xs font-medium ${
          positive === true  ? 'text-emerald-400' :
          positive === false ? 'text-red-400'     : 'text-zinc-500'
        }`}>{sub}</p>
      )}
    </div>
  );
}
