'use client';

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, TooltipProps,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { PostData } from '@/lib/types';

interface Props { posts: PostData[] }

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as PostData & { dateLabel: string };
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs space-y-1 max-w-[200px]">
      <p className="text-zinc-400">{label}</p>
      {p.title && <p className="text-zinc-200 line-clamp-2">{p.title}</p>}
      <p className="text-violet-400 font-semibold">{Number(payload[0]?.value).toLocaleString()} views</p>
      {p.engagement_rate > 0 && (
        <p className="text-emerald-400">{p.engagement_rate.toFixed(2)}% eng</p>
      )}
    </div>
  );
}

export default function VideoPerformanceChart({ posts }: Props) {
  if (posts.length === 0) {
    return <div className="h-52 flex items-center justify-center text-zinc-500 text-sm">No data</div>;
  }

  // Sort chronologically, take last 30
  const data = [...posts]
    .sort((a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime())
    .slice(-30)
    .map(p => ({
      ...p,
      dateLabel: (() => { try { return format(parseISO(p.published_at), 'MMM d'); } catch { return p.published_at.slice(0, 10); } })(),
    }));

  return (
    <ResponsiveContainer width="100%" height={208}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false} tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false} tickLine={false} width={48}
          tickFormatter={v => v >= 1_000_000 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone" dataKey="views" stroke="#7c3aed" strokeWidth={2}
          fill="url(#viewsGrad)" dot={{ r: 3, fill: '#7c3aed', strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#a78bfa' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
