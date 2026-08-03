import { useEffect, useId, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/design-system/Panel";

interface Series { key: string; name: string; color: string; dash?: string }

export interface ChartProvenance {
  metricKey: string;
  formulaVersion: number;
  quality: string;
  observationCount: number;
  excludedCount: number;
  window: Record<string, unknown>;
  filters: Record<string, unknown>;
  grouping: string[];
  aggregation: string;
  denominatorDefinition: string | null;
}

export interface ChartMarker {
  id?: string;
  xValue: string;
  label: string;
  description?: string;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function formatNumber(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString("zh-TW", { maximumFractionDigits: 6 }) : "缺失";
}

function formatTime(value: unknown): string {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    : String(value);
}

export function MetricLineChart({ title, subtitle, data, xKey, xAxisName, yAxisName, unit, series, markers = [], definition, source, sampleSize, missingCount, lastUpdated, provenance, evidenceHref }: {
  title: string;
  subtitle: string;
  data: Array<Record<string, string | number | null>>;
  xKey: string;
  xAxisName: string;
  yAxisName: string;
  unit: string;
  series: Series[];
  markers?: ChartMarker[];
  definition: string;
  source: string;
  sampleSize: number;
  missingCount: number;
  lastUpdated: string | null;
  provenance?: ChartProvenance | null;
  evidenceHref?: string;
}) {
  const reducedMotion = useReducedMotion();
  const descriptionId = useId();
  const [activeMarker, setActiveMarker] = useState<ChartMarker | null>(null);
  const parsedTimes = data.map((row) => Date.parse(String(row[xKey])));
  const timeAxis = parsedTimes.every(Number.isFinite) && new Set(parsedTimes).size > 1;
  const chartData = useMemo(() => data.map((row, index) => ({
    ...row,
    __axisValue: timeAxis ? parsedTimes[index] : String(row[xKey]),
    __axisLabel: String(row[xKey]),
  })), [data, parsedTimes, timeAxis, xKey]);
  const numericValues = data.flatMap((row) => series.map((item) => Number(row[item.key])).filter(Number.isFinite));
  const minimum = Math.min(0, ...numericValues);
  const maximum = Math.max(0, ...numericValues);
  const yDomain: [number, number] = minimum === maximum ? [minimum, minimum + 1] : [minimum, maximum];
  const minimumTime = timeAxis ? Math.min(...parsedTimes) : null;
  const maximumTime = timeAxis ? Math.max(...parsedTimes) : null;
  const visibleMarkers = timeAxis
    ? markers.filter((marker) => {
        const time = Date.parse(marker.xValue);
        return Number.isFinite(time) && time >= minimumTime! && time <= maximumTime!;
      })
    : [];

  if (!data.length) return <EmptyState title="尚無可繪製資料" detail="新增資料後，圖表會依正式計算結果出現，不會顯示示範曲線。" />;

  return (
    <figure className="chart-frame" aria-label={title} aria-describedby={descriptionId} data-chart-points={data.length}>
      <figcaption>
        <strong>{title}</strong>
        <span id={descriptionId}>{subtitle}</span>
      </figcaption>
      <div className="chart-frame__plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 24, right: 28, bottom: 42, left: 34 }} accessibilityLayer>
            <CartesianGrid stroke="#d0cec4" strokeDasharray="3 4" />
            <XAxis
              dataKey="__axisValue"
              type={timeAxis ? "number" : "category"}
              domain={timeAxis ? [minimumTime!, maximumTime!] : undefined}
              scale={timeAxis ? "time" : "auto"}
              tickFormatter={timeAxis ? formatTime : (value) => String(value)}
              minTickGap={24}
              label={{ value: xAxisName, position: "insideBottom", offset: -28 }}
              name={xAxisName}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={formatNumber}
              label={{ value: `${yAxisName}（${unit}）`, angle: -90, position: "insideLeft", offset: -18 }}
              name={yAxisName}
              unit={unit}
              width={72}
            />
            <Tooltip
              labelFormatter={(value) => timeAxis ? formatTime(value) : String(value)}
              formatter={(value, name) => [`${formatNumber(value)} ${unit}`, String(name)]}
              contentStyle={{ border: "1px solid #30372f", borderRadius: 0, background: "#fffef8" }}
            />
            <Legend verticalAlign="top" align="right" />
            {visibleMarkers.map((marker) => (
              <ReferenceLine
                key={marker.id ?? `${marker.xValue}-${marker.label}`}
                x={Date.parse(marker.xValue)}
                stroke="#a1412d"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: marker.label, position: "insideTopLeft", fill: "#7d3021", fontSize: 11 }}
              />
            ))}
            {series.map((item) => (
              <Line
                key={item.key}
                type="linear"
                dataKey={item.key}
                name={item.name}
                stroke={item.color}
                strokeWidth={2.5}
                strokeDasharray={item.dash}
                dot={{ r: 4, strokeWidth: 1.5 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
                isAnimationActive={!reducedMotion}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {visibleMarkers.length ? (
        <div className="chart-markers" aria-label="事件標註">
          <strong>事件標註</strong>
          <div className="chart-markers__list">
            {visibleMarkers.map((marker) => (
              <button
                className="chart-marker"
                type="button"
                key={marker.id ?? `${marker.xValue}-${marker.label}`}
                aria-pressed={activeMarker === marker}
                onMouseEnter={() => setActiveMarker(marker)}
                onFocus={() => setActiveMarker(marker)}
                onClick={() => setActiveMarker(marker)}
              >
                <time>{new Date(marker.xValue).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</time>
                <span>{marker.label}</span>
              </button>
            ))}
          </div>
          {activeMarker ? <p className="chart-marker__detail" role="status"><strong>{activeMarker.label}</strong> · {activeMarker.description || "尚無補充說明"}</p> : null}
        </div>
      ) : null}
      <details className="chart-definition">
        <summary>資料定義與計算依據</summary>
        <dl>
          <div><dt>定義</dt><dd>{definition}</dd></div>
          <div><dt>指標／版本</dt><dd>{provenance ? `${provenance.metricKey}／v${provenance.formulaVersion}` : "缺少計算證據"}</dd></div>
          <div><dt>品質</dt><dd>{provenance?.quality ?? "INSUFFICIENT"}</dd></div>
          <div><dt>來源</dt><dd>{source}</dd></div>
          <div><dt>樣本／觀測／缺失／排除</dt><dd>{sampleSize}／{provenance?.observationCount ?? 0}／{missingCount}／{provenance?.excludedCount ?? 0}</dd></div>
          <div><dt>時間範圍</dt><dd>{provenance ? JSON.stringify(provenance.window) : "未提供"}</dd></div>
          <div><dt>篩選</dt><dd>{provenance ? JSON.stringify(provenance.filters) : "未提供"}</dd></div>
          <div><dt>分組</dt><dd>{provenance?.grouping.length ? provenance.grouping.join("、") : "無"}</dd></div>
          <div><dt>聚合</dt><dd>{provenance?.aggregation ?? "未提供"}</dd></div>
          <div><dt>分母</dt><dd>{provenance?.denominatorDefinition ?? "不適用"}</dd></div>
          <div><dt>最後計算</dt><dd>{lastUpdated ?? "尚未計算"}</dd></div>
        </dl>
        {evidenceHref ? <a className="chart-evidence-link" href={evidenceHref}>查看原始資料／計算依據</a> : null}
      </details>
    </figure>
  );
}
