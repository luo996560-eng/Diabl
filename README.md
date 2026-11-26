# Diabl｜時空武林

《時空武林》是持續開發中的武俠文字遊戲。遊戲入口為 `index.html`；GitHub Pages 由 GitHub Actions workflow 發佈。

## 鈕釦認知模組（離線原型）

目前版本在既有繁體中文語意判讀上加入可載入 JSON 資料包，以及本機語用／情緒線索與回應策略。資料包位於 `packs/`，由 `packs/manifest.json` 列表索引；manifest 內每個 SHA-256 必須對應 JSON 的實際位元組。`core/pack-loader.js` 僅載入同源 JSON，檢查路徑、大小、雜湊與 schema；資料包是資料，不會以程式碼執行。

已列入的資料包包括鈕釦人格、江湖詞彙、繁體中文語用線索、情緒線索、判定守則及對答策略。新增或修改資料包後，請更新 manifest 中的版本與 SHA-256，並執行：

```sh
node tests/niukou-pack.test.mjs
node --check core/pack-loader.js
node --check core/niukou-cognition.js
node --check core/niukou-neural.js
```

情緒辨識只提供對話語氣線索，不直接改變善惡或遊戲狀態；判定與對答模組也只輸出建議。`core/niukou-neural.js` 是可檢視的小型本機 MLP（雜湊字元 n-gram 特徵），不是大型生成式模型，也不會呼叫雲端 AI。它至少需要 12 筆人工標記且涵蓋至少兩個類別，並達到保守信心與類別差距後才提出分類建議。玩家更正／確認記憶優先；明確威脅、敵意及高信心本地規則有保護條件。所有遊戲結果仍須由遊戲核心規則驗證，鈕釦不擁有任意改寫狀態的權限。

這是漸進式離線原型，並非能自由對答如流的通用神經網路。後續應先以玩家測試累積經同意的人工標記、擴充詞彙和情境覆蓋、調整否定與上下文處理，並持續驗證低信心澄清與規則安全；只有在充分測試且明確設計狀態驗證介面後，才考慮讓自由輸入逐步取代既有事件選項。任何雲端模型或 API 整合都需另行評估費用、隱私及授權，本版本未設定也未提交 API secrets。

## 開發檢查

```sh
node tests/niukou-pack.test.mjs
```
