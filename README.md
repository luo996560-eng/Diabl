# Diabl｜時空武林

《時空武林》是持續開發中的武俠文字遊戲。遊戲入口為 `index.html`；GitHub Pages 由 GitHub Actions workflow 發佈。

## 鈕釦認知模組（離線原型）

目前版本在既有繁體中文語意判讀上加入可載入 JSON 資料包，以及本機語用／情緒線索、共感式回應策略與原創江湖詞條。`core/niukou-vocabulary.js` 只為輸入補充詞彙語境，不作善惡判定。資料包位於 `packs/`，由 `packs/manifest.json` 列表索引；manifest 內每個 SHA-256 必須對應 JSON 的實際位元組。`core/pack-loader.js` 僅載入同源 JSON，檢查路徑、大小、雜湊與 schema；資料包是資料，不會以程式碼執行。

已列入的資料包包括鈕釦人格、江湖詞彙、繁體中文語用線索、情緒線索、判定守則、對答策略及新的江湖語彙模組。新增或修改資料包後，請更新 manifest 中的版本與 SHA-256，並執行：

```sh
node tests/niukou-pack.test.mjs
node --check core/pack-loader.js
node --check core/niukou-vocabulary.js
node --check core/niukou-cognition.js
node --check core/niukou-neural.js
node --check core/niukou-wordbank.js
```

情緒辨識只提供對話語氣線索，不直接改變善惡或遊戲狀態；判定與對答模組也只輸出建議。`core/niukou-neural.js` 是可檢視的小型本機 MLP（雜湊字元 n-gram 特徵），不是大型生成式模型，也不會呼叫雲端 AI。它至少需要 12 筆人工標記且涵蓋至少兩個類別，並達到保守信心與類別差距後才提出分類建議。玩家更正／確認記憶優先；明確威脅、敵意及高信心本地規則有保護條件。所有遊戲結果仍須由遊戲核心規則驗證，鈕釦不擁有任意改寫狀態的權限。

這是漸進式離線原型，並非能自由對答如流的通用神經網路。鈕釦練習場新增玩家手動觸發的中文 Wiktionary 單詞查詢：只有明確輸入的單一詞語會送往 `zh.wiktionary.org`；不送玩家整段對話、遊戲記憶或本機學習資料。遠端摘錄只列為本機「未審核候選」，不參與判定、不改變遊戲狀態，也不會自動併入版本庫詞包；本機資料可刪除或匯出 JSON。Wiktionary 內容另受 CC BY-SA／GFDL 條款約束，若要重新散布，必須先檢查各來源頁、保留歸屬／授權並符合相應條件。項目採用 wiktextract 僅作離線 dump 處理的參考，不在遊戲端抓取任意網頁；本版自創詞包未引入未授權語料。更完整的開源評估見 [`docs/niukou-open-source-review.md`](docs/niukou-open-source-review.md)。

玩家明確確認的分類回饋與詞庫候選都留在本機，不會上傳。高信心規則、明確威脅與敵意仍有安全優先條件；所有遊戲結果仍由遊戲核心規則驗證。任何雲端模型或 API 整合都需另行評估費用、隱私及授權，本版本未設定也未提交 API secrets。

## 開發檢查

```sh
node tests/niukou-pack.test.mjs
```
