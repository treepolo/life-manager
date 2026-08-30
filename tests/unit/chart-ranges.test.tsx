import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <svg>{children}</svg>,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  Tooltip: () => null,
  YAxis: () => null,
  XAxis: (props: {
    domain: [number | string, number | string];
    tickCount?: number;
    ticks?: number[];
    tickFormatter: (value: number) => string;
  }) => (
    <foreignObject>
      <div
        data-testid="mock-x-axis"
        data-start={String(props.domain[0])}
        data-end={String(props.domain[1])}
        data-tick-count={String(props.tickCount ?? "")}
        data-ticks={(props.ticks ?? []).join(",")}
        data-tick-labels={(props.ticks ?? []).map((value) => props.tickFormatter(value)).join("|")}
      />
    </foreignObject>
  ),
}));

import { CrayonLineChart } from "@/components/CrayonLineChart";
import { ageOnDate, localDateTimestamp, shiftMonths, taipeiDate } from "@/modules/simple/date";

afterEach(cleanup);

const today = taipeiDate();
const [year, month] = today.split("-");

function chart() {
  return render(
    <CrayonLineChart
      title="測試圖"
      description="測試"
      data={[
        { date: "2025-01-01", value: 10 },
        { date: today, value: 20 },
      ]}
      series={[{ key: "value", name: "值" }]}
      yLabel="值"
      timelineStartDate="2004-01-01"
      birthDate="2004-01-01"
    />,
  );
}

describe("圖表時間尺度", () => {
  it("全部尺度明確產生多個跨人生區間的年份與年齡刻度", () => {
    chart();
    const axis = screen.getByTestId("mock-x-axis");
    const ticks = (axis.getAttribute("data-ticks") ?? "").split(",").filter(Boolean);
    const labels = (axis.getAttribute("data-tick-labels") ?? "").split("|").filter(Boolean);
    const currentAge = ageOnDate("2004-01-01", today);

    expect(axis).toHaveAttribute("data-start", String(localDateTimestamp("2004-01-01")));
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks[0]).toBe(String(localDateTimestamp("2004-01-01")));
    expect(ticks.at(-1)).toBe(String(localDateTimestamp(today)));
    expect(labels[0]).toContain("2004");
    expect(labels[0]).toContain("0歲");
    expect(labels.at(-1)).toContain(`${currentAge}歲`);
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
  });

  it("可切到近一年、今年與本月", () => {
    chart();
    const axis = () => screen.getByTestId("mock-x-axis");

    fireEvent.click(screen.getByRole("button", { name: "近一年" }));
    expect(axis()).toHaveAttribute("data-start", String(localDateTimestamp(shiftMonths(today, -12))));

    fireEvent.click(screen.getByRole("button", { name: "今年" }));
    expect(axis()).toHaveAttribute("data-start", String(localDateTimestamp(`${year}-01-01`)));

    fireEvent.click(screen.getByRole("button", { name: "本月" }));
    expect(axis()).toHaveAttribute("data-start", String(localDateTimestamp(`${year}-${month}-01`)));
    expect(axis()).toHaveAttribute("data-tick-count", "5");
    expect(screen.getByRole("button", { name: "本月" })).toHaveAttribute("aria-pressed", "true");
  });
});
