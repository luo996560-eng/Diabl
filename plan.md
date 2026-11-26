# 時空武林：鈕釦與可載入擴充包

## 目標與決策

保留目前 `index.html` 的完整遊戲、存檔相容與離線鈕釦作為基底；新增可版本化的 JSON 內容包及載入器。鈕釦應理解玩家輸入、利用玩家確認/修正學習、能回覆江湖人物情境。即時生成式聊天經由同源後端代理提供；未設定/離線時繼續使用既有規則分類與預寫回覆。AI 僅可提出受限的對話分類與文字回覆，既有遊戲端 `validateDDProposal` 是唯一態度/結局判定權威；模型不能直接改存檔或遊戲數值。API 金鑰只用部署環境的 server-side secret，禁止存在 HTML、JSON pack、localStorage 或 Git。

## 實作方式

保留主遊戲為 `index.html`，只在現有鈕釦判讀與深度對話入口插入橋接點，降低重寫風險。新增 `core/pack-loader.js` 非執行式資料包載入器，從 `packs/manifest.json` 讀取版本、相依與檔案摘要，驗證各 pack 欄位後提供同步查詢介面。內容包只允許 JSON 數據（對話語料、意圖提示、受控標籤），不允許任意 JavaScript。新增 `core/niukou-bridge.js` 管理對話 endpoint、請求上下文、輸出格式驗證、逾時與 fallback。新增可自架的 Cloudflare Worker OpenAI-compatible 代理範本；需要部署者設定 endpoint/model/API secret 後才能啟用雲端生成，不把任何憑證提交到倉庫。

部署於 GitHub Pages 時核心與內容包可直接運作；聊天後端需額外部署 Worker 並把公開 URL 設於鈕釦設定（URL 可存，secret 僅設在 Worker）。所有端點只收必要對話文字及公開遊戲上下文，限制長度/輪數/請求大小，拒絕任意 tool execution；輸出必須通過 schema 與遊戲端 validator。離線規則不因模型故障而失效。

## 預期結構

- `index.html`：既有遊戲 UI、狀態、存檔、既有規則，作為相容宿主。
- `core/pack-loader.js`：manifest、版本、依賴、摘要、JSON schema 驗證與資料包註冊。
- `core/niukou-bridge.js`：AI endpoint 設定、結構化回覆解析與安全降級。
- `packs/manifest.json`：pack 註冊表與最低核心版本。
- `packs/niukou-persona-zh-Hant.json`、`packs/jianghu-glossary-zh-Hant.json`：繁體中文人設、江湖詞彙與回覆風格範例。
- `workers/niukou-chat/`：OpenAI-compatible Cloudflare Worker 範本；用環境 secrets 設定供應商憑證。
- `docs/NIUKOU_SETUP.md`：部署、金鑰設定、擴充包格式與安全限制。

## 設計語言

沿用附件中的宣紙暖白、墨色文字、朱砂按鈕與金色點綴。鈕釦介面把「判讀結果、信心、理由、玩家修正、AI 回應」清楚分層；載入狀態、離線狀態及網路錯誤明示呈現。對話記錄維持既有遊戲美術語彙，減少等待遮擋，手機輸入框與送出操作保持易觸。
