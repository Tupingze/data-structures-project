# PrepLab 工程面試練習室 2.0

以 MediaTek 軟體／韌體職缺為情境的課程專案，非公司官方服務或真實題庫。提供不需金鑰的示範模式，以及 OpenAI Responses、Realtime API 整合。無 RAG。

## 開始使用

1. 安裝 Node.js 22 或更新版本。
2. 解壓縮整個專案。Windows 可雙擊 `start-windows.cmd`，或在專案資料夾執行 `npm start`。
3. 開啟 http://127.0.0.1:4173 ，選「示範練習」。不需安裝第三方 npm 套件。

不要直接雙擊 HTML；網頁需要本機伺服器載入模組。關閉終端機會停止服務。

## 功能

- 履歷文字／TXT／Markdown、職缺背景、3 或 5 題、可編輯題庫。
- 示範練習：固定題目、一次追問、C++ 編輯、錄音回聽、暫停與續練。
- GPT 練習：背景出題、動態追問、逐題回饋、引用回答原句、重答比較。
- GPT 原生語音：WebRTC、手動開始／結束收音、面試官語音、可核對逐字稿；每題最多一次追問。
- 歷史回顧、Markdown 匯出、重答與保存錄音。
- 完整備份／還原：履歷、題庫、未完成進度、歷史、GPT 結果、錄音及完整性檢查。

## GPT 設定（可稍後完成）

複製 `.env.example` 為 `.env`，在自己的電腦填入 `OPENAI_API_KEY`，重新啟動。不要將金鑰放進前端、備份或版本控制。網頁「存取碼」是 `APP_ACCESS_TOKEN`，不是 OpenAI 金鑰。模型名稱在 `.env` 設定。

目前交付不含金鑰。AI 請求與語音事件已用模擬服務測試，尚未驗證真實帳戶額度、模型權限、語音品質與費用。示範模式不會呼叫 OpenAI；GPT 模式會送出背景、題目、回答與程式，語音另傳送聲音。啟用時使用 API 額度。

## 開發與移交

```sh
npm test
npm run handoff
```

`releases/` 產生可獨立開發的 ZIP；接手者解壓後執行 `npm run verify:handoff` 檢查檔案雜湊，再 `npm start`。**程式 ZIP 不含瀏覽器中的使用者資料**；搬資料須另從網站「資料與連線設定 → 下載完整備份」，在新環境還原。

詳見 [交接與啟動](docs/HANDOFF.md)、[架構與 API](docs/ARCHITECTURE.md)、[Demo 與驗收](docs/DEMO.md)。

## 限制

資料存在目前瀏覽器的 localStorage 與 IndexedDB，沒有雲端同步或多人共同帳戶。程式碼僅供模型分析，不會編譯執行；關鍵詞標記不是技術評分，GPT 回饋也不是錄取機率。錄音需瀏覽器權限及 HTTPS／localhost。關閉頁面前請先停止錄音並等候保存。Google Fonts 連線失敗時使用系統字型。
