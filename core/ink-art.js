/* 水墨素材庫 v1.0.0
 * 210 幅水墨圖：寵物 50、妻子（紅顏）100、龍套 60（山賊／首領／魔教各 20）。
 * 依名字做穩定雜湊取圖，同一角色每次載入都拿到同一張，換裝置也不會變臉。
 */
(function (root) {
  'use strict';

  var BASE = 'assets/ink/';
  var PET_COUNT = { 狗: 5, 貓: 5, 鷹: 4, 蛇: 4, 狼: 4, 蟲: 4, 鼠: 4, 蟻: 4, 猴: 4, 龜: 4, 鹿: 4, 狐: 4 };
  var WIFE_COUNT = 100;
  var FOE_COUNT = 20;
  var FOE_KEYS = ['shanzhai', 'shouling', 'mojiao'];

  function hash(text) {
    var s = String(text == null ? '' : text), h = 2166136261 >>> 0, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }
  function speciesOf(species) {
    var s = String(species || '').replace(/^[小幼]/, '');
    if (PET_COUNT[s]) return s;
    var map = { 犬: '狗', 猫: '貓', 鵰: '鷹', 鳥: '鷹', 蟲: '蟲', 蟻: '蟻' };
    return map[s] || null;
  }
  function petPath(species, stage, seed) {
    var sp = speciesOf(species);
    if (!sp) return null;
    var count = PET_COUNT[sp];
    // 同一物種先在牠自己的圖裡輪替；stage 讓成長階段也換一張，但仍在同物種內
    var idx = (hash(sp + '|' + (seed || 'x')) + (Number(stage) || 0)) % count + 1;
    return BASE + 'pet/' + sp + idx + '.webp';
  }
  function wifePath(seed) {
    return BASE + 'wife/w' + pad(hash(seed) % WIFE_COUNT + 1, 3) + '.webp';
  }
  function foeFaction(name) {
    var n = String(name || '');
    if (/首領|頭目|寨主|幫主|教主|宗主|霸主/.test(n)) return 'shouling';
    if (/魔教|魔門|邪教|魔宗|血教/.test(n)) return 'mojiao';
    if (/山賊|土匪|嘍囉|盜匪|惡霸|江洋|敗類|鏢匪|賊人/.test(n)) return 'shanzhai';
    return FOE_KEYS[hash('foe|' + n) % FOE_KEYS.length];
  }
  function foePath(name) {
    var faction = foeFaction(name);
    var idx = hash(name + '|' + faction) % FOE_COUNT + 1;
    return BASE + 'foe/' + faction + pad(idx, 2) + '.webp';
  }
  function pick(kind, name, ctx) {
    var c = ctx || {};
    if (kind === 'pet') return petPath(c.species || name, c.stage || 0, name);
    if (kind === 'enemy') return foePath(c.enemy || name);
    if (kind === 'partner' || kind === 'confidante') return wifePath(name || '紅顏');
    if (kind === 'wife') return wifePath(name || '妻子');
    return null;
  }
  function imgTag(src, alt, cls) {
    return '<img class="' + (cls || 'ink-photo-img') + '" src="' + src + '" alt="' + String(alt || '').replace(/"/g, '') +
      '" loading="lazy" decoding="async" onerror="this.remove()">';
  }
  function html(kind, name, ctx, cls) {
    var src = pick(kind, name, ctx);
    return src ? imgTag(src, name, cls) : '';
  }

  root.InkArt = {
    version: '1.0.0',
    base: BASE,
    counts: { pet: 50, wife: WIFE_COUNT, foe: FOE_COUNT, foeKeys: FOE_KEYS.slice() },
    hash: hash,
    speciesOf: speciesOf,
    petPath: petPath,
    wifePath: wifePath,
    foePath: foePath,
    foeFaction: foeFaction,
    pick: pick,
    html: html
  };
})(typeof window !== 'undefined' ? window : globalThis);
