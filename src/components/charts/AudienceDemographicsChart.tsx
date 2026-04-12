'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, TooltipProps,
} from 'recharts';

interface DemoItem {
  dimension: string;
  label: string;
  value: number;
}

interface AudienceDemographicsChartProps {
  data: DemoItem[];
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-medium" style={{ color: p.color }}>
          {p.name}: {Number(p.value).toFixed(1)}%
        </p>
      ))}
    </div>
  );
}

/** Parse label formats from multiple platforms:
 *  - Instagram: "F.18-24" → { gender: "F", age: "18-24" }
 *  - YouTube:   "female.age18-24" → { gender: "female", age: "18-24" }
 */
function parseLabel(label: string): { age: string; gender: string } {
  const parts = label.split('.');
  if (parts.length >= 2) {
    const gender = parts[0].toUpperCase().startsWith('F') ? 'F' : 'M';
    const age = parts.slice(1).join('.').replace(/^age/i, '');
    return { age, gender };
  }
  return { age: label, gender: '?' };
}

export default function AudienceDemographicsChart({ data }: AudienceDemographicsChartProps) {
  const ageDemoData = data.filter(d => d.dimension === 'age_gender');

  if (ageDemoData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
        No audience data yet
      </div>
    );
  }

  // Group by age bracket, split by gender
  const ageMap: Record<string, { age: string; male: number; female: number }> = {};
  for (const item of ageDemoData) {
    const { age, gender } = parseLabel(item.label);
    ageMap[age] ??= { age, male: 0, female: 0 };
    if (gender === 'F') {
      ageMap[age].female += item.value;
    } else {
      ageMap[age].male += item.value;
    }
  }

  const ageOrder = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const chartData = Object.values(ageMap).sort((a, b) => {
    const ai = ageOrder.findIndex(x => a.age.includes(x.split('-')[0]));
    const bi = ageOrder.findIndex(x => b.age.includes(x.split('-')[0]));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <ResponsiveContainer width="100%" height={192}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="age"
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={v => `${v.toFixed(0)}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', color: '#71717a' }}
          iconType="circle"
          iconSize={7}
        />
        <Bar dataKey="female" name="Female" fill="#f472b6" radius={[2, 2, 0, 0]} />
        <Bar dataKey="male" name="Male" fill="#60a5fa" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
