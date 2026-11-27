# 水墨素材庫

- `pet/`：50 幅，12 物種各 4–5 幅，命名為 `<物種><序號>.webp`。
- `wife/`：100 幅，`w001.webp`–`w100.webp`，用於妻子（伴侶）與紅顏知己。
- `foe/`：60 幅，`shanzhai01–20`（山賊）、`shouling01–20`（首領）、`mojiao01–20`（魔教爪牙）。
- `manifest.json`：尺寸、分類、檔名對照。

規格：WebP、長邊 640px、品質 76，總量約 15 MB。全部延遲載入（`loading="lazy"`）。

取圖規則見 `core/ink-art.js`：以名字做 FNV-1a 雜湊，同一角色固定同一張；寵物會鎖在該物種自己的圖內輪替。

風格：宣紙底、濃淡墨分五色、飛白與毛邊、大量留白、右下角一枚朱紅小印。新增圖片請沿用此語言，並更新 `manifest.json`（可用 `tools/build-ink-manifest.mjs`）。
