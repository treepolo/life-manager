import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const main = readFileSync(join(here, "../../src/main.tsx"), "utf8");
const responsiveStyles = readFileSync(join(here, "../../src/app/pages/HomePageResponsive.css"), "utf8");

describe("首頁響應式版面", () => {
  it("載入首頁專用的響應式覆寫樣式", () => {
    expect(main).toContain('import "@/app/pages/HomePageResponsive.css";');
  });

  it("所有新規則只套用到含成就區的首頁，避免污染其他 crayon-page", () => {
    expect(responsiveStyles).toContain(".page.crayon-page:has(> .achievement-board)");
    expect(responsiveStyles).toContain(".main-stage:has(> .page.crayon-page > .achievement-board)");
    expect(responsiveStyles).not.toMatch(/\n\s*\.page\.crayon-page\s*\{/);
  });

  it("手機把生日進度做成全寬獨立區塊，成就內容另成大卡", () => {
    expect(responsiveStyles).toMatch(/@media \(max-width: 780px\)[\s\S]*\.achievement-board \.life-ribbon \{[\s\S]*width: 100%;/);
    expect(responsiveStyles).toMatch(/\.achievement-title-copy \{[\s\S]*border: 3px solid var\(--ink\);/);
    expect(responsiveStyles).toMatch(/\.achievement-grid \{[\s\S]*border: 3px solid var\(--ink\);/);
  });

  it("桌機使用十二欄儀表板並讓三張圖表同列", () => {
    expect(responsiveStyles).toMatch(/@media \(min-width: 1180px\)[\s\S]*grid-template-columns: repeat\(12, minmax\(0, 1fr\)\);/);
    expect(responsiveStyles).toMatch(/> \.chart-stack \{[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(responsiveStyles).toContain("height: clamp(165px, 22vh, 220px);");
  });
});
