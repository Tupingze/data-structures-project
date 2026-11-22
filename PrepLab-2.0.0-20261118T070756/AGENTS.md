# PrepLab 2.0 — Agent 工作基準

MediaTek 軟體／韌體面試情境課程專案（版本 `2.0.0`），目前示範模式可獨立啟動與操作，真實 GPT／語音仍待金鑰實測驗收。

## 0. 必讀專案文件
修改架構、面試流程、AI 契約或準備 Demo 前，先閱讀對應文件：
- `docs/HANDOFF.md`（交接與移轉細節、環境變數與三人分工）
- `docs/ARCHITECTURE.md`（系統架構、API 契約、模組責任與狀態邊界）
- `docs/DEMO.md`（無金鑰／真金鑰 Demo 步驟與驗收清單）

## 1. Living Status（即時進度看板）
- **最後更新**：`2026-11-22`
- **環境與測試基線**：
  - Node.js `v24.15.0`（需求 `>=22`），離線測試 `npm test` `44/44` 通過。
  - 備註：Windows Git checkout 換行符轉換會使舊版 `HANDOFF-MANIFEST.json` 的 `verify:handoff` 報雜湊不符（如 `dist/ai-client.js`），此屬預期；交付打包前重新執行 `npm run handoff` 即可。
- **接手後四步驟進度（未經同意不可跳步）**：
  - [ ] **1｜設定服務**：由 `.env.example` 複製 `.env`，填入 `OPENAI_API_KEY` 並重啟；確認額度與模型權限。
  - [ ] **2｜實測文字面試**：完成「出題 → 回答 → 追問 → 回饋 → 重答比較」，核對引文與技術內容，測試斷線／額度不足，記錄延遲與費用。
  - [ ] **3｜實測語音**：使用真實麥克風驗證收音、播音、逐字稿、一次追問、換題與錄音保存；檢查拒絕權限、斷線與重連。
  - [ ] **4｜調整並完成 Demo**：依教授要求調整職務題目、難度與回饋標準；以真實帳戶完整跑一次 Demo，整理限制與三位組員實際貢獻。
- **實測數據與已知問題**：
  - 尚未進行真金鑰實測（待步驟 2–3 填入延遲、費用、誤字與 Bug 紀錄）。
- **近期變更紀錄**：
  - `2026-11-22`：建立雙層 `AGENTS.md` 工作基準與 `update-agents-md` / `handoff-acceptance` Skills。

## 2. 技術架構與關鍵不變量（不可破壞）
- **零依賴架構**：純 Node.js 22+ 原生 ESM，**不需要 `npm install`**，未經同意不得引入第三方 npm 套件或前端打包工具。
- **預設模型與存取碼**：文字 `gpt-4.1`、語音 `gpt-realtime`、逐字稿 `gpt-4o-mini-transcribe`（皆可透過 `.env` 覆蓋）。對外監聽需設 `APP_ACCESS_TOKEN`；**網頁存取碼是 `APP_ACCESS_TOKEN`，不是 OpenAI 金鑰**。
- **AI 契約與誠實原則**：Responses API 採 `store: false` + 嚴格 JSON schema，引文必須出自使用者回答原文；**API 失敗、斷線或額度不足時，絕不可偷偷降級或偽裝成假 AI 結果**。示範模式的關鍵詞檢查不可宣稱為 AI 評分。
- **語音模式邊界**：正式金鑰只留在後端，透過 `POST /api/realtime-token` 發短效憑證供瀏覽器 WebRTC 直連；每題手動結束主回答後最多產生一次追問。
- **資料與備份相容性**：`localStorage` key 為 `preplab.v1`（保留舊 key 相容），備份 `formatVersion=1`、`appVersion=2.0.0`。修改題庫（`dist/domain.js` 或題庫管理）**不得修改歷史場次**。
- **三人分工對照**：

| 成員 | 主要檔案 | 可驗收成果 |
| :--- | :--- | :--- |
| A 介面與流程 | `dist/app.js`、`dist/style.css`、`dist/features.js` | 設定、作答、暫停、回顧、重答 |
| B AI 與語音 | `server/api.mjs`、`dist/ai-client.js`、`dist/realtime.js` | 模型契約、錯誤處理、逐字稿與追問 |
| C 資料與驗證 | `dist/portability.js`、`dist/audio-store.js`、`tests/`、`scripts/` | 備份還原、測試、打包、Demo |

## 3. 範圍與紅線（嚴格遵守，禁止擅自擴充）
- **不做 RAG**，無向量資料庫。
- **資料留在瀏覽器端**（`localStorage` + `IndexedDB`），不做雲端同步或後端使用者資料庫。
- **C++ 程式碼編輯器不實際編譯或執行**。
- **不做登入、多人帳戶、全域費用配額**（屬未來擴充）。
- **Docker** 僅附配置、未驗證，非當前主線任務不要花時間大改。
- **機密保護**：絕不將 `.env`、真實 `OPENAI_API_KEY`（`sk-...`）或個人敏感資料寫入程式碼、文件、commit 或交接壓縮包。

## 4. 驗證與交付規則（Definition of Done）
- **每次程式碼修改後必跑**：在 `PrepLab-2.0.0-20261118T070756/` 執行 `npm test`（確保全部離線測試通過，目前 `44` 項）。
- **人工／瀏覽器驗證**：執行 `npm start` 開啟 `http://127.0.0.1:4173`（Windows 亦可雙擊 `start-windows.cmd`）。
- **交付下一位前**：執行 `npm run handoff` 產生新版 ZIP 與 `HANDOFF-MANIFEST.json`，並對新產出的 `releases/` 內容執行 `npm run verify:handoff` 確認雜湊一致。

## 5. AGENTS.md 維護協議（保持文件「活著」）
- 每當完成任一交接步驟、修完重要 Bug、變更模型／架構／紅線、或取得真實 API 延遲／費用數據時，**Agent 必須在任務結束前同步更新本檔 `## 1. Living Status`**（更新日期、勾選進度、補充實測數據與近期變更），或使用 `update-agents-md` skill 執行。
- 更新時維持簡潔、單檔不超過 `24 KB`，且絕不寫入任何金鑰或個人隱私。
