import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  Tooltip: () => null,
  YAxis: () => null,
  XAxis: (props: { domain: [number | string, number | string]; tickCount?: number; tickFormatter: (value: number) => string }) => (
    <div
      data-testid="mock-x-axis"
      data-start={String(props.domain[0])}
      data-end={String(props.domain[1])}
      data-tick-count={String(props.tickCount ?? "")}
      data-start-label={typeof props.domain[0] === "number" ? props.tickFormatter(props.domain[0]) : ""}
    />
  ),
}));

import { CrayonLineChart } from "@/components/CrayonLineChart";
import { localDateTimestamp, shiftMonths, taipeiDate } from "@/modules/simple/date";

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
  it("全部尺度從出生開始並以年份與年齡標示", () => {
    chart();
    const axis = screen.getByTestId("mock-x-axis");
    expect(axis).toHaveAttribute("data-start", String(localDateTimestamp("2004-01-01")));
    expect(axis).toHaveAttribute("data-tick-count", "6");
    expect(axis.getAttribute("data-start-label")).toContain("2004");
    expect(axis.getAttribute("data-start-label")).toContain("0歲");
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
