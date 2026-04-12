'use client';

import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, TooltipProps,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface DataPoint {
  date: string;
  reach: number;
  impressions: number;
  engagement_rate: number;
  likes: number;
  comments: number;
}

interface EngagementChartProps {
  data: DataPoint[];
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs space-y-1">
      <p className="text-zinc-400">
        {label ? format(parseISO(label), 'MMM d, yyyy') : ''}
      </p>
      {payload.map((p, i) => (
        <p key={i} className="font-medium" style={{ color: p.color }}>
          {p.name}: {
            p.name === 'Eng %'
              ? `${Number(p.value).toFixed(2)}%`
              : Number(p.value).toLocaleString()
          }
        </p>
      ))}
    </div>
  );
}

export default function EngagementChart({ data }: EngagementChartProps) {
  const hasData = data.some(d => d.reach > 0 || d.impressions > 0 || d.engagement_rate > 0);

  if (!hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
        No engagement data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={192}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
          yAxisId="left"
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={v => `${v.toFixed(1)}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', color: '#71717a' }}
          iconType="circle"
          iconSize={7}
        />
        <Bar yAxisId="left" dataKey="reach" name="Reach" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} />
        <Bar yAxisId="left" dataKey="impressions" name="Impressions" fill="#6366f1" opacity={0.5} radius={[2, 2, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="engagement_rate"
          name="Eng %"
          stroke="#f472b6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
