'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, TooltipProps,
} from 'recharts';
import type { ContentType } from '@/lib/types';

interface TypeStat {
  type: ContentType;
  avg_views: number;
  count: number;
}

interface Props { types: TypeStat[] }

const TYPE_LABELS: Record<ContentType, string> = {
  short:    'Shorts / Reels',
  video:    'Long-form Video',
  photo:    'Photo',
  carousel: 'Carousel',
  tweet:    'Tweet',
  live:     'Live',
  unknown:  'Other',
};

const TYPE_COLORS: Record<ContentType, string> = {
  short:    '#f472b6',
  video:    '#60a5fa',
  photo:    '#a78bfa',
  carousel: '#34d399',
  tweet:    '#38bdf8',
  live:     '#fb923c',
  unknown:  '#6b7280',
};

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as TypeStat;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs space-y-1">
      <p className="text-zinc-300 font-medium">{TYPE_LABELS[d.type]}</p>
      <p className="font-semibold" style={{ color: TYPE_COLORS[d.type] }}>
        {Number(payload[0]?.value).toLocaleString()} avg views
      </p>
      <p className="text-zinc-500">{d.count} post{d.count !== 1 ? 's' : ''}</p>
    </div>
  );
}

export default function ContentTypeChart({ types }: Props) {
  if (types.length === 0) {
    return <div className="h-40 flex items-center justify-center text-zinc-500 text-sm">No data</div>;
  }

  const data = types
    .filter(t => t.count > 0)
    .sort((a, b) => b.avg_views - a.avg_views)
    .map(t => ({ ...t, label: TYPE_LABELS[t.type] }));

  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(100, data.length * 52)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#71717a', fontSize: 10 }}
            axisLine={false} tickLine={false}
            tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)}
          />
          <YAxis
            type="category" dataKey="label" width={110}
            tick={{ fill: '#a1a1aa', fontSize: 11 }}
            axisLine={false} tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="avg_views" radius={[0, 4, 4, 0]} maxBarSize={32}>
            {data.map((d, i) => (
              <Cell key={i} fill={TYPE_COLORS[d.type]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {data.map(d => (
          <div key={d.type} className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: TYPE_COLORS[d.type] }} />
            {d.count} {TYPE_LABELS[d.type].toLowerCase()}
          </div>
        ))}
      </div>
    </>
  );
}
