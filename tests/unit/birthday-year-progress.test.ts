import { describe, expect, it } from "vitest";

import { birthdayYearProgress } from "@/modules/simple/date";

describe("生日年度進度軸", () => {
  it("以前一次生日到下一次生日為兩端，月份刻度落在真實月初", () => {
    const progress = birthdayYearProgress("2004-01-03", "2026-08-31");
    expect(progress).not.toBeNull();
    expect(progress?.previousBirthday).toBe("2026-01-03");
    expect(progress?.nextBirthday).toBe("2027-01-03");
    expect(progress?.currentAge).toBe(22);
    expect(progress?.nextAge).toBe(23);
    expect(progress?.monthTicks[0]).toMatchObject({ date: "2026-02-01", label: "2月" });
    expect(progress?.monthTicks.at(-1)).toMatchObject({ date: "2027-01-01", label: "1月" });
    expect(progress?.monthTicks).toHaveLength(12);
  });

  it("月份刻度依真實日數定位，而不是把一年平均切成十二份", () => {
    const progress = birthdayYearProgress("2004-01-03", "2026-08-31");
    const ticks = progress?.monthTicks ?? [];
    const febToMar = ticks[1].progress - ticks[0].progress;
    const marToApr = ticks[2].progress - ticks[1].progress;
    expect(febToMar).not.toBeCloseTo(marToApr, 5);
  });
});
