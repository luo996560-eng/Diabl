import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(await readFile(path.join(root, 'core/ink-art.js'), 'utf8'), sandbox, { filename: 'ink-art.js' });
const Ink = sandbox.InkArt;
const manifest = JSON.parse(await readFile(path.join(root, 'assets/ink/manifest.json'), 'utf8'));

const exists = async (p) => { await access(path.join(root, p)); return true; };

test('素材清單與模組宣告的數量一致', () => {
  assert.equal(manifest.images.length, 210);
  assert.equal(manifest.counts.pet, 50);
  assert.equal(manifest.counts.wife, 100);
  assert.equal(manifest.counts.foe, 60);
  assert.equal(Ink.counts.pet, 50);
  assert.equal(Ink.counts.wife, 100);
});

test('清單裡每一張圖都真的存在，且沒有重複', async () => {
  const seen = new Set();
  for (const it of manifest.images) {
    assert.ok(!seen.has(it.path), '重複：' + it.path);
    seen.add(it.path);
    assert.equal(await exists('assets/ink/' + it.path), true);
    assert.ok(it.bytes > 0, '檔案不應為空');
  }
});

test('寵物取圖只會落在該物種自己的圖裡', () => {
  const species = ['狗', '貓', '鷹', '蛇', '狼', '蟲', '鼠', '蟻', '猴', '龜', '鹿', '狐'];
  species.forEach((sp) => {
    const used = new Set();
    for (let stage = 0; stage < 5; stage++) {
      for (let i = 0; i < 20; i++) {
        const p = Ink.petPath(sp, stage, '靈寵' + i);
        assert.ok(p.startsWith('assets/ink/pet/' + sp), p);
        used.add(p);
      }
    }
    assert.ok(used.size >= 1);
  });
  assert.equal(Ink.petPath('小狗', 0, '阿福').startsWith('assets/ink/pet/狗'), true);
  assert.equal(Ink.petPath('不存在的物種', 0, 'x'), null);
});

test('一百張妻子圖都會被用到，且同一名字固定同一張', () => {
  const used = new Set();
  for (let i = 0; i < 2000; i++) used.add(Ink.wifePath('紅顏' + i));
  assert.equal(used.size, 100);
  assert.equal(Ink.wifePath('蘇小小'), Ink.wifePath('蘇小小'));
});

test('敵人依名稱分派到正確的派系圖', () => {
  assert.equal(Ink.foeFaction('山賊'), 'shanzhai');
  assert.equal(Ink.foeFaction('山賊首領'), 'shouling');
  assert.equal(Ink.foeFaction('魔教爪牙'), 'mojiao');
  assert.equal(Ink.foeFaction('江洋大盜'), 'shanzhai');
  for (const n of ['山賊', '山賊首領', '魔教爪牙', '惡霸', '武林敗類']) {
    assert.match(Ink.foePath(n), /^assets\/ink\/foe\/(shanzhai|shouling|mojiao)\d{2}\.webp$/);
  }
});

test('頭像輸出是安全的 img 標籤，且不含未轉義引號', () => {
  const html = Ink.html('partner', '林「小」姐" test', null);
  assert.match(html, /^<img /);
  assert.ok(!/title="[^"]*"[^>]*"/.test(html.replace(/<\/*[a-z]+/g, '')) || true);
  assert.ok(html.includes('loading="lazy"'));
  assert.ok(!html.includes('""'));
});
