# 架構與維護位置

## 資料流

文字：瀏覽器 → 同來源 `/api/interview` → OpenAI Responses → 結構化結果與引用驗證 → 瀏覽器保存。

語音：瀏覽器 → `/api/realtime-token` 短效憑證 → WebRTC 直連 OpenAI → 音訊／逐字稿事件。正式金鑰只在後端。手動結束主回答後產生一次追問；追問回答結束後不再出題。

備份：localStorage 狀態 + IndexedDB 錄音 → 版本化 JSON／base64 + SHA-256 → 新裝置驗證還原。沒有 RAG、向量資料庫或伺服器使用者資料庫。

## 模組

| 檔案 | 責任 |
|---|---|
| dist/app.js | 導覽、題庫、場次、報告、表單 |
| dist/domain.js | 預設內容、純函式、規則式示範回饋 |
| dist/features.js | GPT、語音與備份介面整合 |
| dist/ai-client.js | 請求編號、錯誤、記憶體存取碼 |
| dist/realtime.js | RTC、手動回合、取消與資源釋放 |
| dist/audio-store.js | IndexedDB 錄音與交易 |
| dist/portability.js | 備份格式、驗證、雜湊與解析 |
| server/api.mjs | 共用後端、提示詞、schemas、驗證 |
| server.mjs | Node 原生 HTTP 與靜態服務 |
| scripts/build-worker.mjs | 前後端封裝成 Sites Worker |
| scripts/package-handoff.mjs | 白名單打包，不含金鑰、個資或平台身分 |

## API

`GET /api/health`：configured、textModel、realtimeModel、authRequired、version。configured 只表示有金鑰，沒有連線驗證。

`POST /api/interview`：`{action,requestId,profile,questions?,question?,answer?,previousAnswer?}`。回答為 text／code／followupText。回傳 `{data,meta}`，meta 含 model、promptVersion、usage、generatedAt。

- plan：data.questions，同題庫格式，最多 5 題。
- followup：data.followup。
- feedback：summary、strengths[{point,evidence}]、improvements[{point,evidence,suggestion}]、unassessed[]。
- compare：summary、changes[{point,before,after}]、remaining[]。

`POST /api/realtime-token`：`{requestId,profile,question}` → `{value,expiresAt,model}`；value 只供當次 WebRTC。

錯誤為 `{error:{code,message}}` 及適當 HTTP 狀態。Responses 使用 store:false、嚴格 JSON schema，引用證據須來自提供的回答，否則拒絕展示。引用檢查不保證技術正確性。

## 狀態與錯誤邊界

localStorage key 為 `preplab.v1`，保留舊 key 以相容使用者。狀態含 profile、questions、active、history；場次保存題目快照、drafts、answers、metadata。題庫更新不改舊紀錄。錄音以 sessionId、questionId、slot（main／followup）關聯。

備份 formatVersion=1，appVersion=2.0.0。破壞性變更需增加遷移與測試。保留未知延伸欄位，驗證已知欄位型別與上限。不要把示範關鍵詞檢查說成 AI 成績。

後端限制請求大小、輸入長度、同來源與遠端存取碼。相同編號同內容的處理中請求共用結果，成功短暫快取，失敗可重試。去重與限流只在同一程序／Worker 實例有效，不是全域費用上限。公開使用需增加持久化配額、使用者身分與監控。
