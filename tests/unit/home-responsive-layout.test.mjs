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

  it("覆寫規則只套用到含成就區的首頁", () => {
    expect(responsiveStyles).toContain(".page.crayon-page:has(> .achievement-board)");
    expect(responsiveStyles).not.toMatch(/\n\s*\.page\.crayon-page\s*\{/);
  });

  it("成就卡非同步插入時不讓瀏覽器把橫向位置錨定到右側", () => {
    expect(responsiveStyles).toMatch(/\.page\.crayon-page:has\(> \.achievement-board\) \.achievement-grid \{\s*overflow-anchor: none;/);
  });

  it("生日進度在所有尺寸都使用無外框樣式", () => {
    expect(responsiveStyles).toMatch(/\.page\.crayon-page:has\(> \.achievement-board\) \.life-ribbon \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;[\s\S]*transform: none;/);
  });

  it("手機把生日進度放在成就區最上方", () => {
    expect(responsiveStyles).toMatch(/\.achievement-board \.life-ribbon \{[\s\S]*grid-row: 1;/);
    expect(responsiveStyles).toMatch(/\.achievement-title-copy \{[\s\S]*grid-row: 2;/);
    expect(responsiveStyles).toMatch(/\.achievement-grid \{[\s\S]*grid-row: 3;/);
  });

  it("手機成就橫向卡片保留左右 gutter", () => {
    expect(responsiveStyles).toMatch(/\.achievement-grid \{[\s\S]*padding: 4px 16px 15px;[\s\S]*scroll-padding-inline: 16px;/);
  });

  it("手機成就大框右側與底部陰影連續", () => {
    expect(responsiveStyles).toMatch(/\.achievement-grid \{[\s\S]*box-shadow: 4px 0 0 #b6a78c, 4px 4px 0 #b6a78c;/);
  });

  it("任務成就卡與進度條不再刻意旋轉", () => {
    expect(responsiveStyles).toMatch(/\.achievement-card\.task-achievement \{\s*transform: none;/);
    expect(responsiveStyles).toMatch(/\.task-achievement \.milestone-track i \{\s*transform: none;/);
  });

  it("不覆寫桌機成十二欄儀表板", () => {
    expect(responsiveStyles).not.toContain("@media (min-width: 1180px)");
    expect(responsiveStyles).not.toContain("repeat(12, minmax(0, 1fr))");
  });
});
