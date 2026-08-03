import { describe, expect, it } from "vitest";

import { normalizeBrokerageRows, parseCsv, previewCsv } from "@/integrations/firstrade-csv/importer";

const csv = `Date,Type,Description,Symbol,Quantity,Amount,Currency,Transaction ID\n2026-01-01,BUY,Buy stock,AAA,2,-100.25,USD,t1\n2026-01-02,SELL,Sell stock,AAA,1,70.00,USD,t2\n2026-01-03,DIVIDEND,Dividend,AAA,,5.25,USD,t3\n2026-01-04,INTEREST,Interest,,,1.50,USD,t4\n2026-01-05,DEPOSIT,Deposit,,,500.00,USD,t5\n2026-01-06,WITHDRAWAL,Withdrawal,,,-50.00,USD,t6\n2026-01-07,FEE,Fee,,,-2.25,USD,t7\n2026-01-08,MYSTERY,Review,,,3.00,USD,t8\n`;

describe("Firstrade通用CSV adapter", () => {
  it("預覽不超過指定列但保留完整總列數與檔案雜湊", async () => {
    const buffer = new TextEncoder().encode(csv).buffer;
    const preview = await previewCsv(buffer, 2);
    expect(preview.encoding).toBe("UTF-8");
    expect(preview.rows).toHaveLength(2);
    expect(preview.totalRows).toBe(8);
    expect(preview.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await parseCsv(buffer)).rows).toHaveLength(8);
  });

  it("買賣股息利息存提款費用正規化，未知類型保留並要求人工", async () => {
    const parsed = await parseCsv(new TextEncoder().encode(csv).buffer);
    const profile = {
      date: "Date", type: "Type", description: "Description", symbol: "Symbol", quantity: "Quantity", amount: "Amount", currency: "Currency", transactionId: "Transaction ID",
      typeMap: { BUY: "BUY", SELL: "SELL", DIVIDEND: "DIVIDEND", INTEREST: "INTEREST", DEPOSIT: "DEPOSIT", WITHDRAWAL: "WITHDRAWAL", FEE: "FEE" }, dateFormat: "AUTO", defaultCurrency: "USD", minorUnitScale: 2,
    } as const;
    const normalized = await normalizeBrokerageRows(parsed, profile, "brokerage-account-1");
    expect(normalized.errors).toEqual([]);
    expect(normalized.activities.map((item) => item.activityType)).toEqual(["BUY", "SELL", "DIVIDEND", "INTEREST", "DEPOSIT", "WITHDRAWAL", "FEE", "UNCLASSIFIED"]);
    expect(normalized.activities[0].amountMinor).toBe(-10_025);
    expect(normalized.activities.at(-1)?.requiresReview).toBe(true);
    const rerun = await normalizeBrokerageRows(parsed, profile, "brokerage-account-1");
    expect(rerun.activities[0].stableDedupeKey).toBe(normalized.activities[0].stableDedupeKey);
  });
});
