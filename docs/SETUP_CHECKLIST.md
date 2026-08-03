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
- staging URL：Cloudflare登入並建立workers.dev subdomain後記為`https://life-manager-staging.<實際subdomain>.workers.dev`；不得猜測subdomain，部署輸出後立即回填完整網址。
- D1名稱：`life-manager-staging`，binding固定為`LIFE_DB`；建立後將實際database ID寫入`env.staging.d1_databases`，不與local/production共用。
- Access application：建議名稱`人生管理器-staging`，Self-hosted application，domain使用上列完整staging hostname。
- 允許的使用者身分：只填使用者本人登入Cloudflare的email，Access policy為Allow／Emails／該單一email；同值另存Worker secret `ACCESS_ALLOWED_EMAIL`。
- callback base URL：等於上列staging origin，不含尾斜線；Worker var `OAUTH_CALLBACK_BASE_URL`。YouTube與Instagram完整callback分別再加`/oauth/youtube/callback`、`/oauth/instagram/callback`。

步驟：

- [ ] Codex執行`wrangler login`，使用者在瀏覽器同意。
- [ ] Codex用Wrangler建立staging D1與Worker。
- [ ] Codex套用migration並部署。
- [ ] 使用者在Zero Trust建立／確認Access，僅允許本人。
- [ ] 無Access session的瀏覽器驗證被拒絕。
- [ ] 手機及電腦可開啟staging。

## SETUP-003　YouTube

Codex先提供：

- Google Cloud project名稱建議：`life-manager-personal`。
- 要啟用的API：`YouTube Data API v3`及`YouTube Analytics API`。
- OAuth client type：`Web application`；建議名稱`life-manager-staging`。
- Authorized redirect URI：`https://life-manager-staging.<實際subdomain>.workers.dev/oauth/youtube/callback`；production另建`https://life-manager.<實際subdomain>.workers.dev/oauth/youtube/callback`。
- Requested scopes：`https://www.googleapis.com/auth/youtube.readonly`、`https://www.googleapis.com/auth/yt-analytics.readonly`；不要求收益或寫入scope。
- Secret名稱：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`；token本身由App以`TOKEN_ENCRYPTION_KEY`做AES-GCM密文保存。

使用者操作：

- [ ] 建立／選擇Google Cloud project。
- [ ] 啟用YouTube Analytics API及程式確實使用的YouTube Data API。
- [ ] 設定OAuth consent screen及test user（如需要）。
- [ ] 建立Web application OAuth client。
- [ ] 貼入Codex提供的redirect URI，完全一致。
- [ ] 將client ID／secret以Cloudflare Secret方式輸入，不貼到聊天。
- [ ] 在App按「連接YouTube」並同意唯讀非收益權限。
- [ ] Codex執行AT-YT-04真實核對。

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

Codex先提供：

- Resend帳號使用的收件地址：使用者本人建立Resend帳號的email；在App「重要期限 → 通知偏好」輸入後加密保存，不貼在聊天或設定檔。
- Cloudflare Secret名稱：`RESEND_API_KEY`、`RESEND_FROM`。
- 測試寄件from：沒有自有驗證網域時使用Resend帳號允許的`onboarding@resend.dev`並以`RESEND_FROM`保存；只能寄到帳號本人地址。
- 測試內容：選一筆正式期限，在「通知通道測試」選Email；主旨／本文必須包含該期限名稱、級別、App連結與「這是使用者觸發的測試」，不得建立假期限。

使用者操作：

- [ ] 建立Resend帳號。
- [ ] 建立API key。
- [ ] 以Cloudflare Secret輸入。
- [ ] 確認收件地址為Resend帳號本人信箱；若使用`resend.dev`不得寄到他人。
- [ ] 在App執行測試信。
- [ ] 確認收件並完成AT-MAIL-01。

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
