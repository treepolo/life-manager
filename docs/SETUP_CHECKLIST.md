# 使用者外部服務設定清單

Codex必須在需要使用者介入前填入實際網址、欄位名稱與命令。不得只說「請設定OAuth」。秘密不要貼進聊天或commit；應由使用者在終端／平台Secret介面輸入。

## SETUP-001　開始開發前

使用者目前不需要先設定所有雲端服務。Codex先完成本機正式架構、D1、核心功能、離線、adapter及自動測試。

確認：

- [ ] 使用者能登入Cloudflare帳號。
- [ ] 使用者能登入管理YouTube頻道的Google帳號。
- [ ] 使用者能登入Instagram專業帳號及Meta Developers。
- [ ] 使用者願意建立Resend帳號。
- [ ] 尚未要求使用者提供任何密碼或secret。

## SETUP-002　建立Cloudflare staging

Codex在進行前填入：

- Worker名稱：`life-manager-staging`（已在`wrangler.toml`固定）。
- staging URL：`https://life-manager-staging.life-manager.workers.dev`（2026-08-03部署由Cloudflare回傳並已完成DNS、TLS及HTTPS資產smoke）。
- D1名稱：`life-manager-staging`，binding固定為`LIFE_DB`，database ID為`4a9da6fd-2fe5-41e1-b17f-0f444e60e14c`，region為APAC；已寫入`env.staging.d1_databases`，不與local/production共用。
- Access application：在Worker `life-manager-staging`的網域／URL管理畫面，找到標示為「生產」的`life-manager-staging.life-manager.workers.dev`，把該URL下方的存取狀態由「公開」改為「受限」。介面名稱可能改版，因此以「目標生產Worker URL、目前存取狀態、改為受限」三項識別，不依賴固定側邊欄或英文按鈕名稱。成功後畫面會顯示Access JWT `aud`與JWK URL；記錄這兩個非secret設定值後，再核對Access application與本人單一email policy，不手動建立重複hostname application。
- staging Access JWT audience：`0cc6ca1ed73a340419af9e457ce44f52c7b2d67e04272440c223ce6610e1feca`；已寫入`env.staging.vars.ACCESS_AUD`。
- staging Access JWK URL：`https://life-manager.cloudflareaccess.com/cdn-cgi/access/certs`；2026-08-03真實請求回200，team domain `life-manager.cloudflareaccess.com`已寫入`env.staging.vars.ACCESS_TEAM_DOMAIN`。
- 允許的使用者身分：只填使用者本人登入Cloudflare的email，Access policy為Allow／Emails／該單一email；同值另存Worker secret `ACCESS_ALLOWED_EMAIL`。
- callback base URL：`https://life-manager-staging.life-manager.workers.dev`，不含尾斜線；已寫入Worker var `OAUTH_CALLBACK_BASE_URL`。YouTube完整callback為`https://life-manager-staging.life-manager.workers.dev/oauth/youtube/callback`，Instagram完整callback為`https://life-manager-staging.life-manager.workers.dev/oauth/instagram/callback`。

步驟：

- [x] Codex執行`wrangler login`，使用者在瀏覽器同意（2026-08-03 `wrangler whoami`確認）。
- [x] Codex用Wrangler建立staging D1與Worker（D1 ID與URL如上）。
- [x] Codex套用migration並部署（schema 8；2026-08-09部署OAuth state TTL修正後目前版本`f646aea5-eef4-426f-b2af-3bf9f67975a1`且100%流量；HTTPS資產200、API未設定Access時503 fail-closed，Access啟用後未登入health維持302）。
- [x] 使用者在`life-manager-staging`的「網域」頁找到標示「生產」的Worker URL，將存取狀態由「公開」改為「受限」；畫面已顯示Access JWT `aud`與JWK URL。僅本人policy另以下方獨立步驟驗收，不因URL已受限而自動視為完成。
- [x] 無Access session的首頁與`/api/v1/health`均在Cloudflare邊界回302並導向`life-manager.cloudflareaccess.com`登入，未到達Worker。
- [x] 使用者以`wrangler secret put ACCESS_ALLOWED_EMAIL --config wrangler.toml --env staging`安全輸入本人允許的email；Codex只以`wrangler secret list`確認名稱與`secret_text`型別，未讀取或記錄值。部署後Secret仍存在。
- [x] `ACCESS_TEAM_DOMAIN`／`ACCESS_AUD`已部署；2026-08-03本人Access session取得`/api/v1/health` 200，回應為`status=ok`／`environment=staging`／schema 8。API路由前的Worker驗證會依序檢查JWT簽章、期限、issuer、audience及`ACCESS_ALLOWED_EMAIL`；本證據不保存每次請求的request ID。
- [x] 使用者已唯讀核對此生產Worker URL所屬Access application只有本人單一Allow policy：`Include` selector為`Emails`且值只有本人地址；沒有額外Allow、Bypass、`Everyone`、email domain或只以登入方式／一次性密碼放行的規則。文件不保存本人email。
- [x] 使用者確認電腦實體瀏覽器可通過Access並載入App首頁，顯示品牌「人生管理器」及第一個主要區塊「今日行動中心」，沒有API或載入錯誤；不保存裝置或瀏覽器識別。
- [x] 使用者確認手機實體瀏覽器可通過Access並載入同一staging App，顯示「人生管理器」與「今日行動中心」且無API／載入錯誤；不保存裝置或瀏覽器識別。

## OFF-005　staging兩台實體裝置同步

本節只使用使用者真正想保存在人生管理器中的資料，不建立「同步測試」等假領域。私人名稱與內容留在App內，不需貼到聊天；Codex只記錄同步狀態、筆數、版本與游標證據。

- [x] 電腦與手機均已通過staging Access並載入App。
- [x] 手機保持連線時已開啟「領域／事業」頁；使用者確認標題為「領域與事業」且沒有載入錯誤，正式殼層與目前資料已完成離線前快取準備。
- [x] 手機保持「領域與事業」頁開啟，關閉Wi-Fi與行動數據；未重新整理、關閉頁面或新增資料。
- [x] 使用者在手機斷網狀態確認底部同步狀態為`0 待同步`，證明沒有先前遺留outbox操作。
- [x] 手機斷網後已在「新增人生領域」提交一筆真正要保存的資料；使用者確認資料出現在頁面且同步狀態由`0`變為`1 待同步`，未向Codex揭露私人內容。
- [x] 手機恢復網路後未按手動按鈕，`online`事件在60秒內自動將`1 待同步`歸零，且沒有畫面錯誤。
- [x] 電腦重新整理／同步後已取得手機建立的同一筆真實領域，底部為`0 待同步`且無錯誤；未向Codex揭露私人內容。
- [x] Codex以staging D1唯讀聚合交叉核對：`areas=1`、area `APPLIED` operation=1、非`APPLIED`=0、area change=1、max area cursor=1、有效device=2、cursor=2、兩個cursor的min/max pulled值皆為1；Cloudflare回報APAC／HKG primary、`rows_written=0`、`changes=0`。查詢沒有選取ID、名稱、說明、原則、user agent或私人payload。2026-08-03曾在SQL前遇到API `7403`，已由2026-08-09本次成功查詢收斂，不以舊失敗冒充完成。

## SETUP-003　YouTube

Codex先提供：

- Google Cloud project name：`life-manager-personal`；實際Project ID：`life-manager-personal-505006`。所有Console深連結與CLI專案識別必須使用Project ID，例如[Google Auth Platform Clients](https://console.cloud.google.com/auth/clients?project=life-manager-personal-505006)；不得把project name放入`?project=`。
- 要啟用的API：`YouTube Data API v3`及`YouTube Analytics API`。
- OAuth client type：`Web application`；建議名稱`life-manager-staging`。
- Authorized redirect URI：`https://life-manager-staging.life-manager.workers.dev/oauth/youtube/callback`；production URL尚未建立，待`SETUP-009`取得真實hostname後另建，禁止使用placeholder。
- Requested scopes：`https://www.googleapis.com/auth/youtube.readonly`、`https://www.googleapis.com/auth/yt-analytics.readonly`；不要求收益或寫入scope。
- Secret名稱：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`；token本身由App以`TOKEN_ENCRYPTION_KEY`做AES-GCM密文保存。
- 私人策略：此App只供本人帳號使用，不申請公眾OAuth onboarding。初次設定可先使用Google Auth Platform的`Testing`狀態並把本人列為test user；但官方說明非基本身分scope的Testing授權與refresh token會在7日後到期，因此這只能做短期驗收。真實同步通過後，長期自用應改為`In production`並維持單一使用者；個人自用情境可不提交公開驗證，但本人授權時可能需通過未驗證App警告，且受未驗證App使用者上限約束。

使用者操作：

- [x] 使用者已在Google Cloud Console建立專用project：project name為`life-manager-personal`，實際Project ID為`life-manager-personal-505006`；不與其他正式App共用，文件不保存Google登入資訊或project number。
- [x] 使用者已在Project ID `life-manager-personal-505006`的API Library啟用`YouTube Data API v3`；未建立API key。
- [x] 使用者已在Project ID `life-manager-personal-505006`的API Library啟用`YouTube Analytics API`；兩個必要YouTube API均已開啟。
- [x] 使用者已在Project ID `life-manager-personal-505006`的Google Auth Platform完成Overview的「Get Started／開始使用」流程。
- [x] App Information已完成：App name為`人生管理器`；User support email由使用者本人從Google下拉選取，地址未提供給Codex；已進入下一頁。
- [x] Audience已選`External`並進入下一頁；此選擇只設定Google OAuth user type，尚未發布App，也不建立公開onboarding。
- [x] Contact Information已完成：developer contact email由使用者本人在Google平台填入，地址未提供給Codex；已進入Finish頁。
- [x] Finish頁已確認App name／`External` Audience摘要、同意Google API Services User Data Policy並完成初始設定；目前未發布App，先維持`Testing`供本人短期驗收。
- [x] Audience的Test users已加入管理本人YouTube頻道的同一Google帳號；使用者只回報完成，email未提供給Codex。
- [x] 使用者已在Data Access只加入並儲存`https://www.googleapis.com/auth/youtube.readonly`與`https://www.googleapis.com/auth/yt-analytics.readonly`；未加入monetary、upload、force-ssl或其他寫入scope。
- [x] 使用者已在Project ID `life-manager-personal-505006`的Google Auth Platform Clients建立`Web application` OAuth client：名稱`life-manager-staging`，Authorized redirect URIs只加入`https://life-manager-staging.life-manager.workers.dev/oauth/youtube/callback`，Authorized JavaScript origins留空；client ID／secret未提供給Codex或寫入文件。
- [x] 使用者已在專案根目錄執行`npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.toml --env staging`；Wrangler遠端唯讀清單確認staging存在`GOOGLE_CLIENT_ID`且型別為`secret_text`，未讀取或保存值。
- [x] 使用者已另一次執行`npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.toml --env staging`；Wrangler遠端唯讀清單確認staging存在`GOOGLE_CLIENT_SECRET`且型別為`secret_text`，未讀取或保存值。
- [x] 使用者已在專案根目錄執行`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put TOKEN_ENCRYPTION_KEY --config wrangler.toml --env staging`；Wrangler遠端唯讀清單確認staging存在`TOKEN_ENCRYPTION_KEY`且型別為`secret_text`，值未顯示、讀取或保存。Cloudflare已由Secret更新建立Worker版本7並配置100%流量，無需另行部署。
- [x] 使用者已在登入Cloudflare Access的真實staging瀏覽器開啟`https://life-manager-staging.life-manager.workers.dev/integrations`；YouTube區塊顯示「尚未授權頻道」與「開始正式授權」，頁面無紅色錯誤，且本步未按授權按鈕。
- [x] 使用者已在YouTube區塊按一次「開始正式授權」並成功到達Google頁面；頁面顯示App名稱`人生管理器`，尚未選帳號、按繼續或同意權限，且未把含OAuth參數的網址提供給Codex。
- [x] 使用者已在Google頁面確認或選擇管理本人YouTube頻道、且已加入Test users的同一Google帳號；未按「繼續」或同意權限，email未提供給Codex。
- [x] 使用者未按任何按鈕，只回報Google頁面主標題為「這個應用程式未經 Google 驗證」；未貼email或含OAuth參數的網址。這是私人`Testing` App尚未提交公開驗證的真實警告，不代表授權已完成。
- [x] 使用者已在實際未驗證App警告頁只按一次「繼續」；成功到達主標題為「`life-manager.workers.dev`要求存取您的 Google 帳戶」的Google權限頁，尚未勾選、繼續或同意scope。
- [x] 使用者保持Google權限頁不動，只讀回報兩項存取權為「查看您的 YouTube 帳戶」與「查看依據您的 YouTube 內容產生的 YouTube 數據分析報表」；沒有收益、上傳、編輯、刪除、管理或其他寫入權限，且尚未勾選或按按鈕。
- [x] 使用者提供目前權限頁截圖；Codex目視確認頂部有「全選」，兩個個別勾選框與「全選」皆未勾選，頁面只有已驗證的兩項唯讀權限，底部動作為「取消」與「繼續」。截圖留在使用者系統暫存位置，未複製進專案或Git。
- [x] 使用者已只按一次「全選」，並確認「全選」與兩個個別唯讀權限共三個勾選框都呈已選狀態；尚未按「繼續」。
- [x] 第一次提交兩項唯讀scope後回到App，但顯示`OAUTH_STATE_INVALID`且沒有connection。唯讀D1聚合確認唯一state未消耗、TTL為10分鐘、callback時已過期約36分鐘，YouTube connection／raw payload皆為0；不是Secret、redirect、scope或token半成品。
- [x] `OAUTH_STATE_TTL_MINUTES=60`程式／設定與固定答案測試已完成，缺失、非整數及10至120分鐘範圍外的設定會安全拒絕；2026-08-09部署為staging版本`f646aea5-eef4-426f-b2af-3bf9f67975a1`且100%流量，四個必要Secret名稱／型別仍存在，未登入health維持302。此修正不需migration，也不放寬一次性state、S256 PKCE、redirect或逾期驗證。
- [x] 使用者已從目前App只按一次「開始正式授權」，新的Google授權頁已開啟，沒有重播舊頁或callback。Codex隨即以staging D1唯讀聚合確認YouTube state總數由1增為2；最新一筆未消耗、尚未過期、TTL精確60分鐘，查詢時尚餘約58.2分鐘，`rows_written=0`／`changes=0`，未選取state、PKCE、token、網址或私人帳號資料。
- [x] 使用者保持新的Google頁面不動，只讀回報主標題為「選擇帳戶」；尚未選帳號、按按鈕或提供email、頻道名稱、網址。這證明新流程目前位於Google帳號選擇頁，未跳過本人test user確認。
- [x] 使用者已在Google「選擇帳戶」頁只選擇先前加入Test users、且管理本人YouTube頻道的同一帳號；下一頁主標題為「這個應用程式未經 Google 驗證」，未按警告頁按鈕，也未回報email、頻道名稱或網址。
- [x] 使用者已在目前未驗證App警告頁只按一次「繼續」，並在新的Google權限頁出現後停下；未勾選或按後續按鈕。
- [x] 使用者提供新流程權限頁截圖；Codex以原始解析度確認頁面只有「查看您的 YouTube 帳戶」與「查看依據您的 YouTube 內容產生的 YouTube 數據分析報表」兩項既定唯讀權限，「全選」與兩個個別勾選框皆未勾選，底部為「取消」與「繼續」。畫面仍提示缺少隱私權政策／服務條款連結，尚未解決；截圖未複製進專案或Git，帳號區域未轉錄。
- [x] 使用者已只按一次「全選」，並確認「全選」與兩個個別唯讀權限共三個勾選框都已選取；尚未按「繼續」，沒有提交scope或觸發callback。
- [x] 使用者已只按一次Google「繼續」提交已選定的兩項唯讀權限，並自動回到staging App；沒有回報email、頻道名稱或含OAuth參數的網址，也沒有按「立即同步」。
- [x] 新流程callback成功：使用者回報沒有紅色錯誤、YouTube顯示`CONNECTED`且出現「立即同步」；截圖中的頻道名稱已模糊且未轉錄。去敏D1聚合確認最新state已消耗、AES-GCM access／refresh token密文存在、兩項唯讀scope精確吻合且無額外scope、account `channels`原始payload與callback成功run存在；未讀取token、帳號ID、顯示名稱或payload內容。
- [x] callback後第一個Cron在舊程式以不合法的`dimensions=video,day`於Analytics階段失敗；修正為官方`dimensions=day`後，真實來源88列中有9列負likes調整，第二個嚴格非負檢查再次安全失敗。兩次都保留真實run／RETRY證據，沒有以假資料或忽略錯誤冒充同步成功。schema 9唯一性、完整分頁、Pacific日界、帶符號來源值、token到期前換發及`ERROR`手動重試修正均已測試；staging Worker版本`f8a9750b-af08-4a27-91d7-679f725ddfea`為100%流量。
- [x] 修正版真實Cron已成功：最新run=`SUCCEEDED`、job=`READY`／attempt 0、connection=`CONNECTED`／錯誤0、來源版本`youtube-data-v3+analytics-v2@2026-08-09`。去敏D1聚合確認1個真實頻道、31支影片、574筆正規化快照；channels／playlist_items／videos／analytics原始payload齊全，raw provenance缺失0，相同語意鍵重複群組0，9筆負likes來源調整未被改寫。所有核對皆為唯讀且未選取私人識別或實際指標值。
- [x] 使用者只重新整理staging「外部連線」頁，未按「立即同步」或「撤銷連線」，並逐項確認YouTube仍為`CONNECTED`、最近錯誤「無」、下一排程`READY`／第0次。來源定義版本另由D1唯讀核對為`youtube-data-v3+analytics-v2@2026-08-09`，不把未由使用者回報的畫面欄位冒充人工確認。
- [x] 使用者在電腦以管理本人頻道的同一Google帳號開啟`https://studio.youtube.com/`，確認進入正確頻道的Studio首頁後停下，沒有進入報表或回報任何私人數值。官方說明指出2026年7月起逐步推出新版Studio，Analytics頁可能不同；後續依畫面成功判據逐步前進，不依賴固定側欄名稱。
- [x] 使用者在目前Studio首頁找到通往頻道層級Analytics的入口並只點擊一次，確認本人頻道的數據分析頁已開啟；沒有切換日期、頁籤、進階模式或回報任何指標值。
- [x] 使用者保持目前數據分析頁不動，只讀確認頁面顯示「進階模式」，各報表卡片實際顯示「顯示更多」，沒有「查看更多」；沒有點擊任何項目或回報指標值。後續選用可統一控制日期／指標的「進階模式」，不使用卡片入口。
- [x] 使用者在目前數據分析頁只點擊一次「進階模式」，確認進階分析報表已開啟；沒有點「顯示更多」、切換日期、維度、指標、篩選、匯出或回報數值。
- [x] 使用者提供目前進階模式截圖；Codex以原始解析度確認日期控制為2026/7/12至2026/8/8／最近28天、報表為依內容顯示觀看次數且總計可見。內容名稱已模糊且未轉錄，截圖未複製進專案或Git。
- [x] 第一輪同期間唯讀核對正確判定為「不相等」：staging D1在上述Studio 28天範圍內只有2026/7/12至2026/8/6共26個daily views來源日期，raw provenance缺失0；Studio範圍另含API尚未回傳的8/7及8/8。布林精確相等為0，Cloudflare回報APAC／HKG primary、`rows_written=0`、`changes=0`；未輸出或寫入實際總和、逐日值、內容ID／名稱、token或payload，且沒有把缺少日期的結果冒充通過。
- [x] 使用者已在目前YouTube Studio進階模式把日期範圍改為自訂2026/7/12至2026/8/6並套用；截圖確認報表仍為依內容顯示觀看次數，沒有變更維度、指標、篩選、圖表或匯出。內容名稱已模糊且未轉錄，截圖未複製進專案或Git。
- [x] AT-YT-04真實頻道人工核對通過：同一個Studio「觀看次數」總計與staging D1在2026/7/12至2026/8/6的來源快照精確相等。唯讀聚合回傳daily views 26列／26個不同來源日、精確起訖日期=1、raw provenance缺失0、精確相等=1；Cloudflare回報APAC／HKG primary、`rows_written=0`、`changes=0`。API `day`依YouTube Analytics的Pacific來源日定義保存，人工核對使用Studio相同印出日期，不以Asia/Taipei日期位移；文件未保存實際總和、逐日值、內容ID／名稱、token或payload。真實頻道1個、影片31支及Analytics來源證據另由成功Cron去敏聚合證明，沒有以D1筆數取代Studio人工總計核對。
- [x] 使用者已在Project ID `life-manager-personal-505006`的Google Auth Platform Audience頁只讀確認Publishing status為「測試」，可用動作為「發布應用程式」；沒有按按鈕、切換狀態或提交驗證，也未提供email、client ID或secret。官方說明Testing的非基本身分scope授權與refresh token七日到期；個人自用可不提交公開驗證，後續目標為`In production`、仍只供本人使用並接受未驗證App警告與使用者上限。
- [x] 使用者只按一次「發布應用程式」並在確認視窗出現後停下；截圖確認標題為「要推送至正式環境嗎？」、說明指出所有Google帳戶皆可存取，且超過10個網域、設有標誌或要求機密／受限制scope時需送交驗證，動作為「取消」與「確認」。尚未按任一動作，也未進入或提交驗證中心；截圖未複製進專案或Git，帳號區域未轉錄。這是Google對發布狀態的通用警告；正式文件另明列個人自用少量已知使用者可不提交公開驗證，因此本專案仍採私人單一使用者、未驗證警告／使用者上限方案，不建立公開onboarding。
- [x] 使用者已在確認視窗只按一次「確認」；更新後截圖確認Publishing status為「實際運作中」、可用狀態動作為「返回測試應用程式」。頁面另顯示「前往驗證中心」通用提示，但使用者未點擊或提交驗證；本專案維持私人單一使用者、Cloudflare Access單一email、無公開OAuth onboarding。為排除既有Testing時期refresh token仍受七日到期限制的風險，後續AT-YT-05會先正式撤銷再於此長期狀態重新授權。
- [x] 使用者已回到並重新整理`https://life-manager-staging.life-manager.workers.dev/integrations`；截圖確認YouTube=`CONNECTED`、最近錯誤「無」、job=`READY`／attempt 0，可見「立即同步」與「撤銷連線」。尚未按任何操作，頻道名稱已模糊且未轉錄，截圖未複製進專案或Git。
- [x] Codex完成撤銷前staging D1去敏唯讀基準：有效YouTube連線1／CONNECTED 1、access密文存在1、refresh密文存在1、YouTube job 1／READY 1／max attempt 0；`financial_accounts`、`finance_categories`、`financial_transactions`目前皆為0列。Cloudflare回報APAC／HKG primary、`rows_written=0`、`changes=0`；未選取token、帳號ID、名稱、財務金額或內容。
- [x] 使用者在目前YouTube卡片只按一次「撤銷連線」並立即停下；更新後截圖確認YouTube=`DISCONNECTED`、操作改為「開始正式授權」、最近錯誤仍為「無」，既有job仍顯示`READY`／attempt 0。此動作已真正走App撤銷流程；頻道名稱已模糊且未轉錄，截圖未複製進專案或Git。密文清除、歷史資料保留與其他模組隔離仍須由下一個去敏唯讀D1核對證明。
- [x] Codex完成撤銷後staging D1去敏唯讀核對：connection總列1／`DISCONNECTED` 1／撤銷時間存在1、access與refresh密文存在數皆0、YouTube job 1／`READY` 1／attempt 0、原始payload 6、正規化快照574；三個財務核心表仍皆0列。APAC／HKG primary回報`rows_written=0`／`changes=0`；查詢未選取token、帳號識別、名稱、標題、payload、財務金額或內容。第一次binding名稱查詢在SQL前被API `7403`拒絕，改用正式D1名稱唯一重試成功；舊失敗未冒充證據。
- [x] Codex只把唯一已斷線YouTube job的`next_run_at`提前，D1精確寫入1列；下一個既有staging Cron於21:15（Asia/Taipei）真實執行後，job=`RETRY`／attempt 1／`PROVIDER_ERROR`，connection仍`DISCONNECTED`、兩種密文仍0、原始payload仍6、快照仍574，三個財務核心表仍皆0列。核對查詢寫入0列；沒有用本機scheduled模擬或假Google回應取代真實排程錯誤。
- [x] 使用者從staging左側導覽只開啟「財務」；頁面正常載入並顯示正常空資料狀態，沒有YouTube或其他錯誤。使用者未新增帳戶、交易、分類或匯入檔案，亦未向Codex揭露私人財務內容；結合撤銷前後三個財務核心表皆0列，證明YouTube失效未影響財務資料或UI。
- [x] 使用者在staging左側導覽只回到「外部連線」；截圖顯示YouTube=`DISCONNECTED`、job已由真實Cron累積至`RETRY`／attempt 4、最近錯誤「無」，操作為「開始正式授權」。頻道名稱已模糊且未轉錄，截圖未複製進專案或Git。
- [x] 使用者只按一次YouTube「開始正式授權」，依Google現行介面選定同一本人帳戶，經未驗證App的「進階」與「前往 life-manager.workers.dev（不安全）」警告，只勾選YouTube帳戶與Analytics報表兩項唯讀scope，最後按「繼續」。未使用其他帳戶、未增加scope、未提交公開驗證。
- [x] callback回到staging後沒有紅色錯誤；截圖確認YouTube=`CONNECTED`、job=`READY`／attempt 0、最近錯誤「無」，可見「立即同步／撤銷連線」。帳號名稱已模糊且未轉錄，截圖未複製進專案或Git。
- [x] Codex完成重新授權後staging D1去敏唯讀核對：有效`CONNECTED` 1、新access密文存在1、新refresh密文存在1、token到期時間在未來1、granted scope精確只有兩項必要唯讀scope 1、近期MANUAL callback成功1、job 1且`READY`／attempt 0／無錯誤1。原始payload仍6、正規化快照仍574，三個財務核心表仍皆0列；APAC／HKG primary回報`rows_written=0`／`changes=0`。撤銷前後密文證據為`1→0→1`，沒有讀取或輸出密文內容。
- [x] 使用者已在目前YouTube卡片只按一次「立即同步」並停下；畫面仍為`CONNECTED`、最近成功22:04:02、最近錯誤「無」、下次排程`READY`／第0次且仍可見「立即同步」，但左下角全域同步顯示「請求已取消」。D1確認該MANUAL run不是成功：寫入4個raw payload、462筆快照後長時間停在`RUNNING`；後續22:15 SCHEDULED run另行成功並新增155筆快照，不能代替手動驗收。根因修正不需migration，涵蓋provider長請求與outbox分流、D1每100筆batch、單一job claim及10分鐘中斷run復原。
- [x] Codex已部署上述修正為staging版本`683e276f-8757-4d3b-8ee7-1d10defc5d8f`並確認100%流量；四個既有Secret名稱／型別完整，未登入health仍由Access回302，D1連線仍`CONNECTED`且兩種token密文存在。22:45自然Cron由新程式把舊MANUAL run收斂為`FAILED`／`SYNC_INTERRUPTED`／error count 1，完成時間22:45:13；該輪沒有到期provider job，job保持`READY`／attempt 0、connection保持`CONNECTED`／無錯誤。這是中斷歷史的正確終止，不是同步成功，也沒有直接SQL改寫。
- [x] 使用者已只重新整理staging外部連線頁一次；頁面正常載入且YouTube仍為`CONNECTED`，沒有按「立即同步」或「撤銷連線」。這證明瀏覽器已取得部署後bundle且既有授權未被stale recovery破壞。
- [x] 使用者在目前YouTube卡片只按一次「立即同步」；截圖顯示最近嘗試與最近成功均更新為23:05:38、connection=`CONNECTED`、最近錯誤「無」、job=`READY`／attempt 0、按鈕恢復「立即同步」，左下角為`0 待同步`且無取消錯誤。D1確認新MANUAL run在19.2秒內`SUCCEEDED`、fetched 4／updated 32／error 0，並維持token、唯一性與財務隔離。
- [x] Codex已補足全域raw去重後缺少的每次run↔raw完整關聯：新增`0010_provider_sync_run_payload_links.sql`、有序關聯寫入、OAuth callback共用路徑、完整JSON匯出／還原與固定答案。lint、雙typecheck、38/38 unit、21/21 Worker／D1、client build、12個schema 10隔離D1 Playwright及正式碼掃描均通過。升級前staging無執行中run/job、孤立raw 0，完整remote SQL備份為2,227,836 bytes且已確認不進Git；套用後schema 10、raw 14／回填link 14／孤立link 0／重複order 0、migration list空。Worker版本`9a72219e-7880-4ec4-b673-0cb99b64791d`經版本與部署狀態交叉確認為100%流量，四個Secret名稱／型別及Access未登入302完整。
- [x] 使用者在目前YouTube卡片只按一次「立即同步」並等待完成，沒有重複點擊；數十秒、少於一分鐘後最近嘗試／成功更新為2026-08-09 23:36:01，connection仍`CONNECTED`、錯誤無、job=`READY`／attempt 0，但執行期間沒有顯示文件既定的「同步中」。Codex以staging D1去敏唯讀聚合確認最新MANUAL run=`SUCCEEDED`、duration 19秒、fetched 4／created 0／updated 32／ignored 0／error 0；`provider_sync_run_payloads`恰為order 0～3四筆且channels／playlist_items／videos／analytics各1、非法raw外鍵0、該run連結快照545、語意重複群組0、job與connection正常、三個財務核心表仍0。Cloudflare回報`rows_written=0`／`changes=0`，未選取私人payload、token、帳號或指標值。schema 10的真實per-run raw追溯閘門已通過；後端成功不能取代缺失的pending UI回饋。
- [x] Codex已定位pending UI缺失不是provider或D1失敗，而是舊Service Worker以永久固定cache名稱及同名資產cache-first，讓既有staging client長期停留舊bundle。修正加入app shell內容衍生版本戳、同源預快取驗證、靜態資產network-first／離線fallback、`updateViaCache: "none"`、主動更新檢查，以及PWA安全更新與YouTube pending固定答案；不需migration、不修改`0001`～`0010`。
- [x] Codex已部署新PWA為staging Worker版本13 `35796472-1e05-4931-b3f8-8f9aa6b6647c`；Wrangler上傳`sw.js`與`app.js`後依已知Windows行為exit 1，但deployment status獨立確認該版本為100%流量。assets、staging D1、fetch／scheduled、四個必要Secret名稱／型別與Access均完整，未讀取Secret值；remote migration list為空，未登入health為302。本步沒有套migration或寫D1。
- [x] 新PWA版本部署後，使用者只重新整理目前staging外部連線頁一次；「有新版可用」確實出現，但只有滾至頁面最底部才看得到，故此步完成但驗收不通過。Codex真實瀏覽器量測確認提示為static且完全落在初始viewport外，已轉入`OFF-001`／`UI-006`修正；未按安全更新、立即同步或撤銷。
- [x] Codex已完成更新提示固定可見、桌面／手機避讓及自動驗收並部署staging版本14 `488a92a7-3ff1-47ec-8a04-49c8b75572a0`；320／390／768／1366／1920五種viewport幾何斷言通過，部署CLI exit 0且100%流量，沒有清除站台資料或套用migration。
- [x] 已登入Codex瀏覽器確認左下角為`0 待同步`後，只按一次「安全更新」並等待自動reload；新bundle正式CSS為`position: fixed`／`z-index: 30`，桌面右下、手機`bottom: 116px`，沒有清除IndexedDB或Cache Storage，也沒有資料遺失。
- [x] 新bundle載入後只按一次YouTube「立即同步」；約1.6秒內按鈕顯示停用「同步中」且同步／撤銷均不可重複操作，完成後恢復「立即同步」。去敏唯讀D1確認新MANUAL run為19秒`SUCCEEDED`、fetched 4／updated 32／error 0、四類有序raw link各1、linked snapshot 545、語意重複0、connection健康、job READY／attempt 0、財務三表0且`rows_written=0`；AT-YT-05完成。

## SETUP-004　Instagram

Codex先提供：

- Meta App類型與名稱：依Meta Developers當下提供的Instagram API自用情境選`Business`，名稱建議`Life Manager Personal`；若介面已改名，以Instagram Login產品支援的類型為準並把畫面選項記回本檔。
- Instagram Login redirect URI：`https://life-manager-staging.<實際subdomain>.workers.dev/oauth/instagram/callback`；production另建`https://life-manager.<實際subdomain>.workers.dev/oauth/instagram/callback`。
- Deauthorize／data deletion URL（若平台要求）：自用app role驗收階段若Meta未要求則不填；若介面強制要求，停止設定並先新增可驗簽的專用callback，不得把Access內頁或假網址填入。
- Requested permissions：`instagram_business_basic`、`instagram_business_manage_insights`。
- Secret名稱：`META_CLIENT_ID`、`META_CLIENT_SECRET`；API版本公開var為`INSTAGRAM_API_VERSION=v23.0`，授權前需在Meta介面再次確認仍支援。

使用者操作：

- [ ] 在Meta Developers建立App。
- [ ] 加入Instagram相關產品／設定。
- [ ] 貼入redirect URI。
- [ ] 將Instagram專業帳號加入可測試／管理範圍。
- [ ] 將client ID／secret以Cloudflare Secret輸入。
- [ ] 在App按「連接Instagram」完成授權。
- [ ] Codex執行AT-IG-02及AT-IG-03真實核對。

若Meta要求額外Review但此App只服務使用者自己管理的專業帳號，Codex應先依官方Standard Access／app role方式完成測試；不得假設需要對外公開服務。

## SETUP-005　Resend電子郵件

目前狀態：`AWAITING_USER_SETUP`（2026-08-11，D線 `codex/accept-resend`；本地修改與自動驗證已完成，停在下一個真人操作）。

本次真實驗收仍精確缺少：

- Resend帳號尚未建立；
- staging Cloudflare Secret `RESEND_API_KEY` 尚未設定；
- staging Cloudflare Secret `RESEND_FROM` 尚未設定；
- App內尚未在Access保護的通知偏好流程保存Resend帳號本人收件地址；
- 尚未取得本人實際收到測試信，以及其delivery log `SENT`／provider message ID對應證據。

上述值不得貼入聊天、Markdown、Git、log、bundle、source map、export或測試snapshot。每次人工操作只完成下一個必要步驟，並以本節固定成功判據回報。

Codex先提供：

- Resend帳號使用的收件地址：使用者本人建立Resend帳號的email；在App「重要期限 → 通知偏好」輸入後加密保存，不貼在聊天或設定檔。
- Cloudflare Secret名稱：`RESEND_API_KEY`、`RESEND_FROM`。
- 測試寄件from：沒有自有驗證網域時使用Resend帳號允許的`onboarding@resend.dev`並以`RESEND_FROM`保存；只能寄到帳號本人地址。
- 測試內容：選一筆正式期限，在「通知通道測試」選Email；主旨／本文必須包含該期限名稱、級別、App連結與「這是使用者觸發的測試」，不得建立假期限。

使用者操作：

- [ ] 建立Resend帳號。
- [ ] 建立API key。
- [ ] 以Cloudflare Secret `RESEND_API_KEY`輸入；Codex只核對名稱與`secret_text`型別，不讀取值。
- [ ] 以Cloudflare Secret `RESEND_FROM`輸入；使用網域時先完成Resend要求的寄件驗證；若採`onboarding@resend.dev`，只寄到Resend帳號本人地址。
- [ ] 確認收件地址為Resend帳號本人信箱；若使用`resend.dev`不得寄到他人。
- [ ] 在Access保護的staging App「重要期限 → 通知偏好」保存本人收件地址，畫面只顯示已安全保存；不把地址提供給Codex。
- [ ] 在App執行測試信；信件主旨／本文必須明確包含期限名稱、重要級別、App連結與「這是使用者觸發的測試」，且不得建立假期限。
- [ ] 確認本人實際收到信；Codex只記錄去敏的接收判據、delivery狀態與provider message ID邊界，不記錄地址或完整本文，完成`AT-MAIL-01`。

固定成功判據：Resend API回傳provider message ID；`notification_deliveries`保存一筆`EMAIL`／`USER_TEST`／`SENT`，`provider_message_id`非空，`error_code`與`error_message_redacted`為空；相同operation重送只回放既有結果且不新增delivery。錯誤時保存`RETRY`、去敏錯誤與attempt，API key／from／收件地址不出現在任何輸出。

自動驗證基線（2026-08-11）：Resend unit 5/5、Worker/D1 Resend contract 1/1、完整unit 15 files／47 tests、完整Worker/D1 2 files／22 tests、lint、typecheck、client build及secret／placeholder掃描通過。完整共用Playwright受其他驗收線同時使用固定`4173`埠影響，未把該環境阻擋誤記為Resend真人驗收證據。

## SETUP-006　Web Push

Codex完成VAPID key產生與server設定，不要求使用者自行理解加密細節。

設定名稱：Worker secrets `WEB_PUSH_VAPID_PRIVATE_KEY`、`WEB_PUSH_VAPID_SUBJECT`（值為`mailto:<使用者本人email>`）；公開Worker var `WEB_PUSH_VAPID_PUBLIC_KEY`；前端build var `VITE_VAPID_PUBLIC_KEY`必須與同一public key完全一致。Codex產生後直接寫入Cloudflare secret／部署環境，不把private key放Git或聊天。

每台裝置：

- [ ] 開啟App。
- [ ] 按「啟用此裝置通知」。
- [ ] 接受瀏覽器／系統通知權限。
- [ ] 執行測試通知。
- [ ] App顯示最後成功時間。
- [ ] 手機與電腦各完成一次。

若裝置不支援Push，App必須明確顯示，不得假裝成功；站內與Email仍可運作。

## SETUP-007　Firstrade CSV

使用者不提供帳密。

- [ ] 從Firstrade官方介面下載帳務／歷史CSV。
- [ ] 建立遮蔽副本，移除帳號、姓名、地址及不需的識別資料，但保留欄名、格式、活動類型與測試金額。
- [ ] 將檔案放入Codex可讀的本機測試位置，確認不commit。
- [ ] Codex建立／修正Firstrade mapping profile。
- [ ] 使用者選定數筆與Firstrade畫面人工核對。
- [ ] 完成AT-INV-05。
- [ ] 正式匯入前先做D1／JSON備份。

## SETUP-008　通知偏好首次設定

保持簡單，只設定一次全域規則：

- [ ] 使用者選擇每天提醒時間（Asia/Taipei）。
- [ ] 使用者確認重複間隔；預設建議每日一次，但不得在未確認前偷偷啟用。
- [ ] 使用者確認收件信箱。
- [ ] 使用者確認最高級警告可使用開啟App時阻礙式視窗。
- [ ] 建立W-8BEN及報稅範本的實際日期。

## SETUP-009　正式上線

正式資源名稱：Worker `life-manager`、D1 `life-manager-production`、Access application `人生管理器-production`；production D1 ID與完整workers.dev URL只在Cloudflare建立後回填。production與staging各自保存secret與OAuth redirect，不共用D1。

- [ ] production D1備份／初始化完成。
- [ ] production migration通過。
- [ ] production Worker部署。
- [ ] Cloudflare Access只允許本人。
- [ ] YouTube及Instagram production callback完成。
- [ ] Push手機與電腦通過。
- [ ] Email通過。
- [ ] PWA加入手機主畫面。
- [ ] 離線建立資料→上線同步→電腦看見，完整走一次。
- [ ] 下載第一份JSON、CSV及D1 SQL備份。
- [ ] `IMPLEMENTATION_STATUS.md`更新為真實狀態。

上線後使用者可直接從手機圖示或電腦網址開啟，不需要每天開電腦、Docker或終端機。
