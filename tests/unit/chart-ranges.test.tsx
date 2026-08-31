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
    ticks?: number[];
    tickFormatter: (value: number) => string;
    padding?: { left?: number; right?: number };
  }) => (
    <foreignObject>
      <div
        data-testid="mock-x-axis"
        data-start={String(props.domain[0])}
        data-end={String(props.domain[1])}
        data-ticks={(props.ticks ?? []).join(",")}
        data-tick-labels={(props.ticks ?? []).map((value) => props.tickFormatter(value)).join("|")}
        data-padding-left={String(props.padding?.left ?? "")}
        data-padding-right={String(props.padding?.right ?? "")}
      />
    </foreignObject>
  ),
}));

import { CrayonLineChart } from "@/components/CrayonLineChart";
import { ageOnDate, localDateTimestamp, shiftDays, shiftMonths, taipeiDate } from "@/modules/simple/date";

afterEach(cleanup);

const today = taipeiDate();
const [year] = today.split("-");

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

function ticksOf(axis: HTMLElement): string[] {
  return (axis.getAttribute("data-ticks") ?? "").split(",").filter(Boolean);
}

function labelsOf(axis: HTMLElement): string[] {
  return (axis.getAttribute("data-tick-labels") ?? "").split("|").filter(Boolean);
}

describe("圖表時間尺度", () => {
  it("全部尺度明確產生多個跨人生區間刻度，年份與年齡分成兩行且左右保留安全距離", () => {
    chart();
    const axis = screen.getByTestId("mock-x-axis");
    const ticks = ticksOf(axis);
    const labels = labelsOf(axis);
    const currentAge = ageOnDate("2004-01-01", today);

    expect(axis).toHaveAttribute("data-start", String(localDateTimestamp("2004-01-01")));
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks[0]).toBe(String(localDateTimestamp("2004-01-01")));
    expect(ticks.at(-1)).toBe(String(localDateTimestamp(today)));
    expect(labels[0]).toBe("2004\n0歲");
    expect(labels.at(-1)).toBe(`${year}\n${currentAge}歲`);
    expect(axis).toHaveAttribute("data-padding-left", "26");
    expect(axis).toHaveAttribute("data-padding-right", "26");
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");
  });

  it("近一年、今年與近30天都有多個明確刻度而不是只顯示最右端", () => {
    chart();
    const axis = () => screen.getByTestId("mock-x-axis");

    fireEvent.click(screen.getByRole("button", { name: "近一年" }));
    expect(axis()).toHaveAttribute("data-start", String(localDateTimestamp(shiftMonths(today, -12))));
    expect(ticksOf(axis()).length).toBeGreaterThanOrEqual(5);
    expect(labelsOf(axis()).every((label) => label.endsWith("月"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "今年" }));
    expect(axis()).toHaveAttribute("data-start", String(localDateTimestamp(`${year}-01-01`)));
    expect(ticksOf(axis()).length).toBeGreaterThanOrEqual(5);
    expect(labelsOf(axis()).every((label) => label.endsWith("月"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "近30天" }));
    expect(axis()).toHaveAttribute("data-start", String(localDateTimestamp(shiftDays(today, -29))));
    expect(ticksOf(axis()).length).toBeGreaterThanOrEqual(5);
    expect(labelsOf(axis()).every((label) => /^\d{1,2}\/\d{1,2}$/.test(label))).toBe(true);
    expect(screen.getByRole("button", { name: "近30天" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "本月" })).not.toBeInTheDocument();
  });

  it("近30天起點可正確跨月、跨年與閏年", () => {
    expect(shiftDays("2026-03-01", -29)).toBe("2026-01-31");
    expect(shiftDays("2024-03-01", -29)).toBe("2024-02-01");
    expect(shiftDays("2026-01-10", -29)).toBe("2025-12-12");
  });
});
