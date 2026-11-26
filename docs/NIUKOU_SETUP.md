# 鈕釦與內容包設定

## 現有功能和新增層

鈕釦保留遊戲內的離線語意規則、玩家糾正記憶與原有遊戲端驗證。`core/pack-loader.js` 只載入受 schema 驗證的 JSON 資料，不會執行 pack 中的 JavaScript。manifest 的每個項目固定 ID、版本、相對路徑與 SHA-256，可選 `dependencies: [{"id":"...","version":"1.2.3"}]` 精確版本相依；依賴包必須先列在 manifest 且成功載入。載入失敗時保留離線模式。新增資料包時，先加入 `packs/` 的 JSON，再將檔案 SHA-256 加進 `packs/manifest.json`。

鈕釦雲端對話透過 `core/niukou-bridge.js` 送至你自行部署的 OpenAI-compatible Cloudflare Worker。瀏覽器只保存 Worker endpoint；模型 API key 僅在 Worker secret 中。AI 回傳分類、信心與回覆草案；客戶端仍會呼叫遊戲既有 `validateDDProposal()`，由遊戲規則計算態度與結局。Worker 沒設定或請求失敗時會退回離線判讀及既有 NPC 回覆池。

## 部署 Worker

1. 安裝 Cloudflare Wrangler，登入你自己的 Cloudflare 帳戶，於 `workers/niukou-chat/` 執行 `wrangler deploy`。
2. 在 Cloudflare Worker 設定變數 `AI_BASE_URL`（供應商 OpenAI-compatible HTTPS API 根網址）與 `AI_MODEL`（該供應商提供的模型 ID）。
3. 以 Cloudflare secret 設定 `AI_API_KEY`，例如 `npx wrangler secret put AI_API_KEY`。不要放入 GitHub、HTML、JSON、遊戲存檔或螢幕截圖。
4. 設定 `ALLOWED_ORIGIN` 為遊戲實際網站的 origin，須包含 scheme/host，不能帶 path。GitHub Pages 專案頁面的 origin 通常是 `https://<owner>.github.io`；自訂網域則用其實際 origin。
5. 建議啟用 Cloudflare rate limiter/WAF；`RATE_LIMITER` binding 範例在 `wrangler.toml` 中註解。若沒啟用 binding，需在 Worker 前方另設限流，避免公開 endpoint 被濫用產生費用。
6. 開啟遊戲「鈕釦」頁籤，在雲端對話設定輸入 Worker URL 並儲存。endpoint URL 可存於本機瀏覽器，但網址不得含 query、fragment 或帳密；API key 不可存入瀏覽器。

若尚未設定 Worker URL，遊戲不會嘗試連線，所有離線功能照常運作。AI 模型費用、隱私/保留政策與可用性依你自行選擇的供應商和 Worker 設定而定。傳送至 Worker 的資料包含玩家剛輸入文字、最近最多 8 則對話、NPC 公開描述、離線分類及載入的有限 JSON pack 摘要；不會傳送整份存檔、帳號資訊或本機學習資料集。

## 新增資料包

資料包必須是 UTF-8 JSON，包含 `schemaVersion: 1`、唯一 `id`、`version`、`type: "data"` 與 `content`。允許人物語氣、江湖詞彙、對話風格範例等資料；不允許函式、任意 DOM、網路請求或直接修改遊戲狀態。對話範例可包含 `input`、`category`、`replyStyle`，以及可選的 `phenomenon` 語意標籤（例如「雙重否定」「指代澄清」「反諷」「玩家修正」）；舊版沒有標籤的範例仍相容。每包不得超過 512 KB。更新 JSON 後必須重算 SHA-256，並同步更新 manifest；有依賴時要先列出其依賴包，再按順序列入相依包。僅新增 pack 不會自行改變遊戲效果；只有核心明確讀取的資料欄位才會被採用。
