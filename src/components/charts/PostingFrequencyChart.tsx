'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, TooltipProps,
} from 'recharts';
import { format, parseISO, startOfWeek, addWeeks } from 'date-fns';
import type { PostData } from '@/lib/types';

interface Props { posts: PostData[] }

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1">Week of {label}</p>
      <p className="text-blue-400 font-semibold">{payload[0]?.value} post{Number(payload[0]?.value) !== 1 ? 's' : ''}</p>
    </div>
  );
}

export default function PostingFrequencyChart({ posts }: Props) {
  if (posts.length === 0) {
    return <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">No data</div>;
  }

  // Bucket posts by week
  const counts = new Map<string, number>();
  for (const p of posts) {
    try {
      const weekStart = format(startOfWeek(parseISO(p.published_at), { weekStartsOn: 1 }), 'MMM d');
      counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
    } catch { /* skip bad dates */ }
  }

  // Sort chronologically
  const sorted = [...posts]
    .map(p => { try { return parseISO(p.published_at).getTime(); } catch { return 0; } })
    .filter(t => t > 0)
    .sort((a, b) => a - b);

  if (sorted.length < 2) {
    return <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">Not enough data</div>;
  }

  // Fill weeks with 0 for gaps
  const start = startOfWeek(new Date(sorted[0]), { weekStartsOn: 1 });
  const end   = startOfWeek(new Date(sorted[sorted.length - 1]), { weekStartsOn: 1 });
  const data: Array<{ week: string; posts: number }> = [];
  let cur = start;
  while (cur <= end) {
    const label = format(cur, 'MMM d');
    data.push({ week: label, posts: counts.get(label) ?? 0 });
    cur = addWeeks(cur, 1);
  }

  // Keep last 16 weeks max
  const visible = data.slice(-16);
  const maxPosts = Math.max(...visible.map(d => d.posts));

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={visible} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false} tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false} tickLine={false} width={24}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="posts" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {visible.map((d, i) => (
            <Cell
              key={i}
              fill={d.posts === maxPosts ? '#3b82f6' : d.posts > 0 ? '#1d4ed8' : '#1e293b'}
              opacity={d.posts === 0 ? 0.3 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
