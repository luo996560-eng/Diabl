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

## 鈕釦擴充模組 v2

在原有認知模組之上新增 9 組能力，全部是本機規則與小型模型，沒有大型語言模型，也不改變遊戲存檔。

| 模組 | 檔案 | 功用 |
| --- | --- | --- |
| 語言詞彙 | `core/niukou-text.js`、`packs/niukou-script-*`、`niukou-synonyms-*`、`niukou-lexicon-*` | 簡轉繁（OpenCC 字表）、DAG 動態規劃斷詞、近義詞群、陌生詞偵測 |
| 情感 | `core/niukou-emotion.js`、`packs/niukou-emotion-*` | 24 種情緒、否定與轉折處理、愉悅／激動／支配三維座標、反諷、心情走勢 |
| 對話 | `core/niukou-dialogue.js`、`packs/niukou-dialogue-*` | 對話行為與話題偵測、重複與換話題、追問建議 |
| 共感 | `core/niukou-empathy.js` | 依情緒與人物性格組出簡短共感句；敵意人物、威脅、反諷時不使用，每場最多 3 次 |
| 神經網絡 | `core/niukou-neural.js` v0.2 | 512 維雜湊特徵（字、詞、近義詞、情緒）＋動量／L2 的 MLP＋kNN 記憶，附 k-fold 交叉驗證；仍須 12 筆人工回饋才會提案 |
| 詞彙整合 | `core/niukou-vocab-integration.js` | 把網路結果整理成草稿，標註來源與授權，由玩家審核後才進入「我的詞庫」，可匯出 |
| 詞彙運用 | `core/niukou-vocab-usage.js` | 追蹤玩家與鈕釦用過的詞，避免重複、避開不適合的場合 |
| 自主學習 | `core/niukou-learning.js` | 好奇清單、主動學習（把握低時問玩家）、把握度校準、間隔複習 |
| 模仿 | `core/niukou-imitation.js`、`packs/niukou-style-*` | 只統計玩家的說話風格（不存原句），用來微調鈕釦自己的措辭 |

### 自主上網搜尋詞彙

`core/niukou-websearch.js` 提供三個無需金鑰、支援 CORS 的來源：中文維基詞典、中文維基百科、維基數據。設計原則如下：

- 預設關閉，需玩家在練習場自行開啟；也可以只用「現在查詢」手動觸發。
- 每次只送出一個 2 至 16 字的中文詞語，不送句子、姓名、存檔或識別資料，不帶 cookie。
- 只允許上述三個網域；有逾時、大小上限、每網域速率限制、連續失敗暫停與 7 天快取；每天上限預設 6 次。
- 每次請求都記錄在練習場，玩家可隨時檢視與清除。
- 查到的內容只成為本機草稿，保留來源網址與授權（維基詞典與維基百科為 CC BY-SA，維基數據為 CC0），玩家審核後才採用，且不參與善惡判定。

### 開發檢查

```sh
node tools/update-manifest.mjs          # 修改任何資料包後重新計算版本與 SHA-256
node tools/update-manifest.mjs --check  # 檢查 manifest 是否與檔案一致
node --test tests/*.test.mjs                      # 所有測試
```

第三方資料與授權請見 [`NOTICE`](NOTICE)。
