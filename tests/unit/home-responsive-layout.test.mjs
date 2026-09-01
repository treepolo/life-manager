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

  it("手機先顯示成就卡，再把生日進度獨立放在下方", () => {
    expect(responsiveStyles).toMatch(/\.achievement-title-copy \{[\s\S]*grid-row: 1;/);
    expect(responsiveStyles).toMatch(/\.achievement-grid \{[\s\S]*grid-row: 2;/);
    expect(responsiveStyles).toMatch(/\.achievement-board \.life-ribbon \{[\s\S]*grid-row: 3;[\s\S]*width: 100%;/);
  });

  it("不再覆寫桌機成十二欄儀表板，並移除成就底紙的尺寸相依裝飾點", () => {
    expect(responsiveStyles).not.toContain("@media (min-width: 1180px)");
    expect(responsiveStyles).not.toContain("repeat(12, minmax(0, 1fr))");
    expect(responsiveStyles).toMatch(/\.achievement-board \{\s*background: #fff8d8;/);
  });
});
