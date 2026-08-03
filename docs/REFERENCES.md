# 官方技術參考

最後查核：2026-08-02。Codex實作外部平台前應重新檢查官方文件及版本，不得只依賴本文件中的舊欄位名稱。

## Cloudflare

- Workers Static Assets：<https://developers.cloudflare.com/workers/static-assets/>
- Static Assets configuration：<https://developers.cloudflare.com/workers/static-assets/binding/>
- D1 local development：<https://developers.cloudflare.com/d1/best-practices/local-development/>
- D1 migrations：<https://developers.cloudflare.com/d1/reference/migrations/>
- D1 import／export：<https://developers.cloudflare.com/d1/best-practices/import-export-data/>
- D1 Time Travel：<https://developers.cloudflare.com/d1/reference/time-travel/>
- Workers Cron Triggers：<https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Cloudflare Access application types／Workers protection：<https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/>
- Cloudflare Access web apps：<https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/>
- Cloudflare bindings：<https://developers.cloudflare.com/workers/runtime-apis/bindings/>
- Workers Web Crypto：<https://developers.cloudflare.com/workers/runtime-apis/web-crypto/>

## PWA與瀏覽器

- Service Worker API：<https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API>
- IndexedDB API：<https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API>
- Using IndexedDB：<https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB>
- Background Synchronization（有限支援，不能作唯一機制）：<https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API>
- Push API：<https://developer.mozilla.org/en-US/docs/Web/API/Push_API>

## YouTube

- YouTube Analytics API reference：<https://developers.google.com/youtube/analytics/reference>
- OAuth overview：<https://developers.google.com/youtube/reporting/guides/authorization>
- Server-side web app OAuth：<https://developers.google.com/youtube/reporting/guides/authorization/server-side-web-apps>
- Credentials：<https://developers.google.com/youtube/reporting/guides/registering_an_application>
- JavaScript web app警告與PKCE建議：<https://developers.google.com/youtube/reporting/guides/authorization/client-side-web-apps>

## Instagram

Meta官方維護的Postman API Network集合：

- Instagram API documentation：<https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api>
- Instagram Insights folder：<https://www.postman.com/meta/instagram/folder/23987686-f659d7d1-d74c-44e4-9192-9b1e8694c511>

實作時需在Meta Developers官方介面重新確認當前API version、Instagram Login、權限名稱、Standard Access及token生命週期。

## Resend

- 免費方案：<https://resend.com/docs/knowledge-base/what-is-resend-pricing>
- `resend.dev`只能寄到帳號本人地址：<https://resend.com/docs/knowledge-base/403-error-resend-dev-domain>

## Firstrade與W-8BEN

- Firstrade W-8BEN說明：<https://help.firstrade.info/en/articles/9268345-what-should-i-know-about-w-8-ben>
- W-8BEN過期影響：<https://help.firstrade.info/en/articles/9251836-what-happens-if-the-w-8-ben-form-on-my-account-expires>
- W-8BEN更新方式：<https://help.firstrade.info/en/articles/14051884-how-do-i-renew-my-w-8ben>
- W-8BEN與預扣／交易限制：<https://help.firstrade.info/en/articles/10492175-w-8ben-and-1042-s-non-us-resident-withholding-and-reclassification>
- IRS W-8 validity：<https://www.irs.gov/instructions/iw8>
- IRS Form W-8BEN instructions：<https://www.irs.gov/instructions/iw8ben>

Firstrade CSV欄位可能隨介面更新，必須以使用者實際下載的遮蔽樣本完成adapter驗收；不得臆測欄名。
