'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, TooltipProps,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface DataPoint {
  date: string;
  followers: number;
  platform?: string;
}

interface FollowerGrowthChartProps {
  data: DataPoint[];
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-sm">
      <p className="text-zinc-400 mb-1">
        {label ? format(parseISO(label), 'MMM d, yyyy') : ''}
      </p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color }}>
          {Number(p.value).toLocaleString()} followers
        </p>
      ))}
    </div>
  );
}

export default function FollowerGrowthChart({ data }: FollowerGrowthChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
        No follower data yet
      </div>
    );
  }

  // Filter out zero-follower entries
  const filtered = data.filter(d => d.followers > 0);
  if (filtered.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
        No follower data yet
      </div>
    );
  }

  const minVal = Math.min(...filtered.map(d => d.followers));
  const padding = Math.max(minVal * 0.05, 100);

  return (
    <ResponsiveContainer width="100%" height={192}>
      <LineChart data={filtered} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={d => {
            try { return format(parseISO(d), 'MMM d'); } catch { return d; }
          }}
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          domain={[minVal - padding, 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="followers"
          stroke="#a78bfa"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#a78bfa' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
