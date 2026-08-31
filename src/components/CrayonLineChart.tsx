import { useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ageOnDate, localDateTimestamp, shiftDays, shiftMonths, taipeiDate } from "@/modules/simple/date";

import "./CrayonLineChart.css";

interface SeriesDefinition {
  key: string;
  name: string;
}

interface CrayonLineChartProps {
  title: string;
  description: string;
  data: object[];
  series: SeriesDefinition[];
  yLabel: string;
  valueFormatter?: (value: number) => string;
  curve?: "linear" | "monotone" | "stepAfter";
  emptyText?: string;
  timelineStartDate?: string | null;
  birthDate?: string | null;
}

type TimeRange = "all" | "lastYear" | "thisYear" | "last30Days";

const rangeOptions: Array<{ key: TimeRange; label: string }> = [
  { key: "all", label: "全部" },
  { key: "lastYear", label: "近一年" },
  { key: "thisYear", label: "今年" },
  { key: "last30Days", label: "近30天" },
];

const palette = ["#d94b37", "#2d6fb7", "#3f8a58", "#d58a22", "#7a56a6", "#9c5140", "#277f86"];
const dashes = [undefined, "9 4", "3 3", "12 4 3 4", "2 5", "8 3 2 3", "14 5"];

function timestampDate(value: number): string {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function rangeStartDate(range: TimeRange, today: string): string | null {
  if (range === "all") return null;
  if (range === "lastYear") return shiftMonths(today, -12);
  if (range === "last30Days") return shiftDays(today, -29);
  const [year] = today.split("-");
  return `${year}-01-01`;
}

function rangeTickCount(range: TimeRange): number {
  if (range === "last30Days") return 5;
  return 7;
}

function allRangeTicks(timelineStartDate: string | null, birthDate: string | null, today: string): number[] | undefined {
  const startDate = timelineStartDate ?? birthDate;
  if (!startDate) return undefined;

  const startTime = localDateTimestamp(startDate);
  const todayTime = localDateTimestamp(today);
  if (startTime >= todayTime) return [startTime];

  if (birthDate && startDate === birthDate) {
    const currentAge = ageOnDate(birthDate, today);
    if (currentAge !== null) {
      if (currentAge === 0) return [startTime, todayTime].filter((value, index, values) => index === 0 || value !== values[index - 1]);
      const ageStep = Math.max(1, Math.ceil(currentAge / 4));
      const ticks: number[] = [];
      for (let age = 0; age < currentAge; age += ageStep) {
        ticks.push(localDateTimestamp(shiftMonths(birthDate, age * 12)));
      }
      ticks.push(todayTime);
      return [...new Set(ticks)];
    }
  }

  return Array.from({ length: 5 }, (_, index) => Math.round(startTime + ((todayTime - startTime) * index) / 4));
}

export function CrayonLineChart({
  title,
  description,
  data,
  series,
  yLabel,
  valueFormatter = (value) => new Intl.NumberFormat("zh-TW").format(value),
  curve = "monotone",
  emptyText = "還沒有足夠的紀錄可以畫圖。",
  timelineStartDate = null,
  birthDate = null,
}: CrayonLineChartProps) {
  const filterId = `crayon-wobble-${useId().replaceAll(":", "")}`;
  const today = taipeiDate();
  const [range, setRange] = useState<TimeRange>("all");
  const timedData = useMemo(() => data.map((row) => {
    const record = row as Record<string, unknown>;
    const date = String(record.date ?? "");
    return { ...record, __time: localDateTimestamp(date) };
  }).sort((a, b) => Number(a.__time) - Number(b.__time)), [data]);

  const startDate = rangeStartDate(range, today);
  const startTime = startDate ? localDateTimestamp(startDate) : null;
  const todayTime = localDateTimestamp(today);
  const displayData = useMemo(() => {
    if (startTime === null) return timedData;
    const before = timedData.filter((row) => Number(row.__time) < startTime).at(-1);
    const within = timedData.filter((row) => Number(row.__time) >= startTime);
    if (!before) return within;
    const synthetic = { ...before, date: startDate, __time: startTime };
    if (within[0] && Number(within[0].__time) === startTime) return within;
    return [synthetic, ...within];
  }, [startDate, startTime, timedData]);

  const timelineStart = range === "all"
    ? (timelineStartDate ? localDateTimestamp(timelineStartDate) : "dataMin")
    : (startTime ?? "dataMin");
  const explicitAllTicks = useMemo(
    () => allRangeTicks(timelineStartDate, birthDate, today),
    [timelineStartDate, birthDate, today],
  );

  const formatTick = (value: number): string => {
    const date = timestampDate(Number(value));
    const [, month, day] = date.split("-");
    if (range === "last30Days") return `${Number(month)}/${Number(day)}`;
    if (range === "lastYear" || range === "thisYear") return `${Number(month)}月`;
    const year = date.slice(0, 4);
    if (!birthDate) return year;
    const age = ageOnDate(birthDate, date);
    return age === null ? year : `${year} · ${age}歲`;
  };

  return (
    <section className="crayon-panel chart-panel" aria-label={title}>
      <header className="panel-heading chart-heading">
        <div>
          <p className="eyebrow">成果軌跡</p>
          <h2>{title}</h2>
        </div>
        <div className="chart-heading-side">
          <p>{description}</p>
          <div className="chart-range-control" role="group" aria-label={`${title}時間尺度`}>
            {rangeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={range === option.key ? "is-active" : ""}
                aria-pressed={range === option.key}
                onClick={() => setRange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      {!data.length || !series.length ? (
        <div className="chart-empty">{emptyText}</div>
      ) : (
        <div className="chart-frame">
          <div className="chart-y-label" data-testid="chart-y-label">
            <span>{yLabel}</span>
          </div>
          <div className="chart-canvas" data-testid="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayData} margin={{ top: 16, right: 18, left: 0, bottom: 18 }}>
                <defs>
                  <filter id={filterId} x="-4%" y="-4%" width="108%" height="108%">
                    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="1" seed="8" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.8" />
                  </filter>
                </defs>
                <CartesianGrid stroke="#c8bda7" strokeDasharray="2 5" vertical={false} />
                <XAxis
                  dataKey="__time"
                  type="number"
                  scale="time"
                  domain={[timelineStart, todayTime]}
                  ticks={range === "all" ? explicitAllTicks : undefined}
                  interval={range === "all" ? 0 : "preserveEnd"}
                  tick={{ fontSize: 12, fill: "#51483d" }}
                  tickFormatter={formatTick}
                  tickLine={false}
                  axisLine={{ stroke: "#6d6254", strokeWidth: 2 }}
                  minTickGap={34}
                  tickCount={range === "all" ? undefined : rangeTickCount(range)}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#51483d" }}
                  tickLine={false}
                  axisLine={{ stroke: "#6d6254", strokeWidth: 2 }}
                  width={58}
                />
                <Tooltip
                  labelFormatter={(label) => `日期 ${timestampDate(Number(label)).replaceAll("-", "/")}`}
                  formatter={(value, name) => [valueFormatter(Number(value)), String(name)]
                  }
                  contentStyle={{ border: "2px solid #51483d", borderRadius: 4, background: "#fffaf0" }}
                />
                {series.length > 1 ? <Legend /> : null}
                {series.map((item, index) => (
                  <Line
                    key={item.key}
                    type={curve}
                    dataKey={item.key}
                    name={item.name}
                    stroke={palette[index % palette.length]}
                    strokeWidth={4}
                    strokeDasharray={dashes[index % dashes.length]}
                    dot={{ r: 3, strokeWidth: 2, fill: "#fffaf0" }}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                    isAnimationActive={false}
                    filter={`url(#${filterId})`}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
