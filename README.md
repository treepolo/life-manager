# 人生管理器 Codex 開發文件包

## 使用方式

1. 將本文件包放入要讓Codex開發的專案根目錄。
2. 在Codex ChatGPT work中貼上`CODEX_START_PROMPT.md`全文，或直接要求它閱讀並執行該檔。
3. Codex必須先讀`AGENTS.md`及`docs/`文件，再開始實作。
4. 需要Cloudflare、Google、Meta、Resend或真實Firstrade CSV時，依`docs/SETUP_CHECKLIST.md`逐步處理。
5. 功能是否完成只看`docs/IMPLEMENTATION_STATUS.md`及測試證據，不看聊天中模糊的完工宣稱。

## 重要提醒

- 第一批是正式版本，不是MVP。
- 外部平台尚未授權時，功能只能標成等待設定，不能使用假資料宣稱完成。
- 正式環境不得自動放入demo資料。
- 使用者不需要一開始設定所有雲端服務；Codex先完成本機開發，再在設定閘門請使用者介入。
