# 鈕釦模組：開源資源與授權審查

## 本次採用方案

本次新增的江湖詞彙條目與解釋文字為《時空武林》自創內容，隨 `packs/niukou-lexicon-zh-Hant.json` 以純 JSON 資料載入。詞彙匹配器只提供可檢視的語境線索；鈕釦原有規則、人工回饋門檻和遊戲核心仍控制判讀與結果。沒有把外部詞典或對話語料直接複製進遊戲，也沒有新增大型模型或第三方執行期相依套件。

鈕釦練習場新增玩家主動啟動的中文 Wiktionary 單詞查詢。查詢只傳使用者在專用欄位輸入的一個詞，不會把玩家完整對話或學習記憶傳出。回傳摘錄以純文字顯示，並標成未審核候選；只有玩家按下保存後才記入該裝置的本機待審清單。候選不會參與判定，不會自動進入正式資料包，也不會被上傳。保存清單可刪除或匯出；若要公開散布，必須逐詞核對來源頁、署名與 CC BY-SA／GFDL 條件。[1] [2]

## 開源候選與採納判斷

**情感與共感。** Taiwan Financial Sentiment Dictionary 的資料採 CC BY 4.0、程式碼採 MIT，但語料偏向財經新聞；NTUSD repo 有 MIT LICENSE，但研究未能確認資料檔授權一定涵蓋全部詞表，因此本次未複製詞條。[3] [4] EmpatheticDialogues 與 ESConv 均採 CC BY-NC 4.0，且為英文資料；非商業限制及內容情境不適合直接放進遊戲。這次只採用一般對話設計概念，繁中策略句由遊戲自行撰寫。[5] [6]

**對話狀態與繁中工具。** CrossWOZ 和 ConvLab-3 採 Apache-2.0，適合離線研究狀態欄位；ConvLab-3 需 Python、PyTorch 與模型，不適合現有 GitHub Pages 瀏覽器架構。[7] [8] jieba 採 MIT、支援繁體分詞；OpenCC 採 Apache-2.0，適合簡繁和臺灣／香港用詞轉換。兩者核心或原始包均非直接放入這個單檔頁面的前端方案；本次先使用自寫小型 JSON 與原生 JavaScript。[9] [10]

**神經網路。** Transformers.js 採 Apache-2.0，ONNX Runtime Web 採 MIT，但兩者程式庫授權不等於模型權重授權。已查到的多語 MiniLM ONNX 權重約 118 MB，且轉換模型頁的獨立授權資訊不充分；對手機首載而言過重，本次保留既有小型本機 MLP，不新增 Transformer。[11] [12] [13]

**詞彙匯入與自主學習。** OpenCC 可作離線字詞轉換參考，Lexedata 是 GPL-3 的 Python 離線資料工具，不作瀏覽器依賴。[10] [14] nbayes 是 ISC 純 JavaScript 專案，但 README 提醒非拉丁語言需適當 tokenizer，且維護狀態較舊；wink Naive Bayes 為 MIT，但有多個依賴且示例偏英文。本遊戲已有本機 MLP 及人工回饋流程，因此本次不加重複分類器；沿用明確人工回饋、可撤銷和本機保存。[15] [16]

**武俠詞彙運用與風格模仿。** hsc-mtl-wuxia 的 README 提到小說平行語料，但未核實到明確資料授權，不能複製或散布其內容。[17] CAT-LLM 是中文文章風格轉換研究程式，GitHub API 未標授權，repo 根目錄也沒有 LICENSE；它不是可自由部署的開源依賴。[18] 遊戲改採自創詞條、玩家自選的語氣設定與本機表層風格統計，不模仿玩家身分，也不自動改寫玩家原意。

**自主網路查詞。** wiktextract 軟體採 MIT，但它抽取的 Wiktionary 內容仍受 CC BY-SA 或 GFDL 等資料條款約束；只能作受控離線處理參考。[19] opencc-js 為 MIT 瀏覽器 JavaScript，opencc-data 採 Apache-2.0，但其用途是簡繁與地區詞轉換，不負責網路查詞或授權審查。[20] 沒有找到一個可以安全地任意搜尋網頁、辨別資料權利並自動產生已授權詞包的現成模組。因此遊戲只向白名單 Wiktionary API 查單一詞，保存前要求玩家明確操作，並保留詞條、來源頁、歷史頁及授權連結。來源資訊不等於授權已核准；發布者仍須人工審查。

## 參考來源

[1]: https://zh.wiktionary.org/w/api.php "中文 Wiktionary API"
[2]: https://en.wiktionary.org/wiki/Wiktionary:Copyrights "Wiktionary 著作權與授權說明"
[3]: https://github.com/RemiMFB/Taiwan-Financial-Sentiment-Dictionary "Taiwan Financial Sentiment Dictionary"
[4]: https://github.com/ntunlplab/NTUSD "NTU Sentiment Dictionary"
[5]: https://github.com/facebookresearch/EmpatheticDialogues "EmpatheticDialogues"
[6]: https://github.com/thu-coai/Emotional-Support-Conversation "Emotional Support Conversation"
[7]: https://github.com/thu-coai/CrossWOZ "CrossWOZ"
[8]: https://github.com/ConvLab/ConvLab-3 "ConvLab-3"
[9]: https://github.com/fxsjy/jieba "jieba"
[10]: https://github.com/BYVoid/OpenCC "OpenCC"
[11]: https://github.com/huggingface/transformers.js "Transformers.js"
[12]: https://github.com/microsoft/onnxruntime/tree/main/js/web "ONNX Runtime Web"
[13]: https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2 "Xenova multilingual MiniLM ONNX model"
[14]: https://github.com/lexedata/lexedata "Lexedata"
[15]: https://github.com/derhuerst/nbayes "nbayes"
[16]: https://github.com/winkjs/wink-naive-bayes-text-classifier "wink Naive Bayes Text Classifier"
[17]: https://github.com/hsilvosa/hsc-mtl-wuxia "Wuxia parallel corpus, licence not verified"
[18]: https://github.com/TaoZhen1110/CAT-LLM "CAT-LLM Chinese style transfer"
[19]: https://github.com/tatuylonen/wiktextract "wiktextract"
[20]: https://github.com/nk2028/opencc-js "opencc-js and opencc-data"
