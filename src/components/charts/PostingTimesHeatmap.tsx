'use client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(h: number) {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

interface StatItem {
  day_of_week: number;
  hour_of_day: number;
  avg_engagement: number;
  post_count?: number;
}

interface PostingTimesHeatmapProps {
  data: StatItem[];
}

export default function PostingTimesHeatmap({ data }: PostingTimesHeatmapProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
        No posting time data yet
      </div>
    );
  }

  // Build lookup map
  const map: Record<string, number> = {};
  let maxEng = 0;
  for (const item of data) {
    const key = `${item.day_of_week}-${item.hour_of_day}`;
    map[key] = item.avg_engagement;
    if (item.avg_engagement > maxEng) maxEng = item.avg_engagement;
  }

  // Only show hours 6am–midnight for a cleaner view
  const visibleHours = HOURS.filter(h => h >= 6);

  function cellColor(day: number, hour: number): string {
    const val = map[`${day}-${hour}`] ?? 0;
    if (val === 0) return 'bg-zinc-800';
    const intensity = maxEng > 0 ? val / maxEng : 0;
    if (intensity > 0.8) return 'bg-emerald-500';
    if (intensity > 0.6) return 'bg-emerald-600';
    if (intensity > 0.4) return 'bg-emerald-700';
    if (intensity > 0.2) return 'bg-emerald-800/80';
    return 'bg-emerald-900/60';
  }

  function cellTitle(day: number, hour: number): string {
    const val = map[`${day}-${hour}`] ?? 0;
    const count = data.find(d => d.day_of_week === day && d.hour_of_day === hour)?.post_count ?? 0;
    if (val === 0) return `${DAYS[day]} ${hourLabel(hour)}: no data`;
    return `${DAYS[day]} ${hourLabel(hour)}: ${val.toFixed(1)}% avg engagement${count > 0 ? ` (${count} posts)` : ''}`;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Hour labels */}
        <div className="flex mb-1 ml-8">
          {visibleHours.map(h => (
            <div
              key={h}
              className="flex-1 text-center text-[9px] text-zinc-600"
              style={{ minWidth: 0 }}
            >
              {h % 3 === 0 ? hourLabel(h) : ''}
            </div>
          ))}
        </div>

        {/* Grid */}
        {DAYS.map((day, dayIdx) => (
          <div key={day} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-7 text-[10px] text-zinc-500 text-right pr-1 flex-shrink-0">{day}</span>
            {visibleHours.map(hour => (
              <div
                key={hour}
                title={cellTitle(dayIdx, hour)}
                className={`flex-1 rounded-sm cursor-default transition-opacity hover:opacity-80 ${cellColor(dayIdx, hour)}`}
                style={{ minWidth: 0, height: 18 }}
              />
            ))}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-[10px] text-zinc-500">Low</span>
          {['bg-emerald-900/60', 'bg-emerald-800/80', 'bg-emerald-700', 'bg-emerald-600', 'bg-emerald-500'].map((c, i) => (
            <div key={i} className={`w-4 h-3 rounded-sm ${c}`} />
          ))}
          <span className="text-[10px] text-zinc-500">High</span>
        </div>
      </div>
    </div>
  );
}
