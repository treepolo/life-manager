import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../../src/app/pages/HomePage.tsx"), "utf8");

describe("首頁圖表順序", () => {
  it("依序顯示每日任務、固定月收入、積蓄", () => {
    const task = source.indexOf('title="每日任務累積完成次數"');
    const income = source.indexOf('title="固定月收入變化"');
    const savings = source.indexOf('title="積蓄變化"');

    expect(task).toBeGreaterThanOrEqual(0);
    expect(income).toBeGreaterThan(task);
    expect(savings).toBeGreaterThan(income);
  });
});
