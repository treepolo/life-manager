import { describe, expect, it } from "vitest";

import { ApiError } from "@/core/errors/api-error";
import { evaluateFormula, formulaMetricKeys, parseFormula } from "@/modules/metrics/formula/engine";

describe("安全公式", () => {
  it("固定答案：成交20／曝光1000 × 100 = 2%並保留來源", () => {
    const result = evaluateFormula("conversion_rate", 3, "conversions / impressions * 100", {
      conversions: { values: ["20"], sourceRefs: [{ type: "metric_observation", id: "conversion-1" }] },
      impressions: { values: ["1000"], sourceRefs: [{ type: "metric_observation", id: "impression-1" }] },
    }, { unit: "percent", precision: 4, window: { from: "2026-01-01", to: "2026-01-31" } });
    expect(result.value).toBe("2");
    expect(result.formulaVersion).toBe(3);
    expect(result.denominatorDefinition).toContain("右側");
    expect(result.sourceRefs).toHaveLength(2);
  });

  it("分母為零時明確不可計算", () => {
    expect(() => evaluateFormula("rate", 1, "a / b", {
      a: { values: ["20"], sourceRefs: [] }, b: { values: ["0"], sourceRefs: [] },
    }, { unit: "percent", precision: 2, window: {} })).toThrowError(ApiError);
    try { evaluateFormula("rate", 1, "a / b", { a: { values: ["20"], sourceRefs: [] }, b: { values: ["0"], sourceRefs: [] } }, { unit: "percent", precision: 2, window: {} }); }
    catch (error) { expect((error as ApiError).code).toBe("FORMULA_DIVISION_BY_ZERO"); }
  });

  it("拒絕任意程式碼並列出受控指標引用", () => {
    expect(formulaMetricKeys(parseFormula("AVG(income) - LAST(expense)"))).toEqual(["income", "expense"]);
    expect(() => parseFormula("globalThis.fetch('x')")).toThrowError(ApiError);
  });
});
