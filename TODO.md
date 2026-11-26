# TODO

- [x] 建立以 `index.html` 為相容主核心的擴充包架構：保留既有遊戲、玩家存檔與離線鈕釦；增加 manifest 與資料包載入器，支援多個 JSON 擴充包、最低核心版本、精確版本相依、SHA-256 與欄位檢查；拒絕任意 JS 執行，載入錯誤時保留核心。
- [x] 強化鈕釦對話：玩家可輸入自然語句，鈕釦依據遊戲人物與最近對話上下文作判讀並給出繁體中文回覆；提供離線分類/回覆 fallback；保留玩家確認/修正的本機學習資料，並讓其優先於雲端建議；新增 20 條附語意現象標籤的繁體中文示例及自動回歸測試。
- [x] 保護遊戲規則與使用者憑證：AI 只提出有限分類及文字回覆；遊戲態度、效果和結局仍由遊戲核心既有 `validateDDProposal()` 驗證；API key 僅由 Worker server secret 讀取，不存於前端 HTML、資料包、localStorage 或 Git。
- [x] 加入可部署的聊天代理範本與設定說明：註明 GitHub Pages 靜態遊戲需另外部署 API 後端；說明 endpoint、model 與 secret 設定方式、輸入/輸出限制、離線模式與資料流。
- [ ] 完成自有 Cloudflare Worker 部署及供應商 secret 設定後，玩家才能使用生成式自然對答；本倉庫只提供安全範本與逐步設定指南，尚未替使用者代部署或代付模型服務。
- [x] 完成 JavaScript 語法、資料包 hash/schema、Worker 輸入輸出限制、存檔 key 相容性與 secret pattern 掃描檢查。
- [ ] 將本地提交推送至 `feat/niukou-modular-packs`；目前 GitHub Git 傳輸回傳 403，須重新授權具有 Contents 寫入權限的 GitHub 工作階段；不覆寫 `main`。
