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

interface SeriesDefinition {
  key: string;
  name: string;
}

interface CrayonLineChartProps {
  title: string;
  description: string;
  data: Array<Record<string, string | number>>;
  series: SeriesDefinition[];
  yLabel: string;
  valueFormatter?: (value: number) => string;
  curve?: "linear" | "monotone" | "stepAfter";
  emptyText?: string;
}

const palette = ["#d94b37", "#2d6fb7", "#3f8a58", "#d58a22", "#7a56a6", "#9c5140", "#277f86"];
const dashes = [undefined, "9 4", "3 3", "12 4 3 4", "2 5", "8 3 2 3", "14 5"];

export function CrayonLineChart({
  title,
  description,
  data,
  series,
  yLabel,
  valueFormatter = (value) => new Intl.NumberFormat("zh-TW").format(value),
  curve = "monotone",
  emptyText = "還沒有足夠的紀錄可以畫圖。",
}: CrayonLineChartProps) {
  return (
    <section className="crayon-panel chart-panel" aria-label={title}>
      <header className="panel-heading">
        <div>
          <p className="eyebrow">成果軌跡</p>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </header>
      {!data.length || !series.length ? (
        <div className="chart-empty">{emptyText}</div>
      ) : (
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 16, right: 18, left: 12, bottom: 18 }}>
              <defs>
                <filter id="crayon-wobble" x="-4%" y="-4%" width="108%" height="108%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="1" seed="8" result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.8" />
                </filter>
              </defs>
              <CartesianGrid stroke="#c8bda7" strokeDasharray="2 5" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: "#51483d" }}
                tickLine={false}
                axisLine={{ stroke: "#6d6254", strokeWidth: 2 }}
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#51483d" }}
                tickLine={false}
                axisLine={{ stroke: "#6d6254", strokeWidth: 2 }}
                width={74}
                label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 8, fill: "#51483d" }}
              />
              <Tooltip
                labelFormatter={(label) => `日期 ${String(label)}`}
                formatter={(value, name) => [valueFormatter(Number(value)), String(name)]}
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
                  filter="url(#crayon-wobble)"
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
