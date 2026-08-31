const test = require('node:test');
const assert = require('node:assert');
const sites = require('../src/common/sites.js');

test('対応サイトをホスト名で判定する', () => {
  assert.strictEqual(sites.detect('https://jp.mercari.com/item/m1').id, 'mercari');
  assert.strictEqual(sites.detect('https://fril.jp/s?query=x').id, 'rakuma');
  assert.strictEqual(sites.detect('https://auctions.yahoo.co.jp/').id, 'yahuoku');
  assert.strictEqual(sites.detect('https://paypayfleamarket.yahoo.co.jp/').id, 'paypay');
  assert.strictEqual(sites.detect('https://example.com/'), null);
});

test('紛らわしいホスト名を対応サイトと誤認しない', () => {
  for (const url of ['https://jp.mercari.com.evil.test/', 'https://notfril.jp/', 'https://fril.jp.example.com/']) {
    assert.strictEqual(sites.detect(url), null, `${url} を誤って判定した`);
  }
});

test('壊れたURLでも例外を投げない', () => {
  for (const bad of ['', 'ほげ', null, undefined, 'http://']) {
    assert.doesNotThrow(() => sites.detect(bad));
    assert.doesNotThrow(() => sites.itemIdOf(bad));
    assert.doesNotThrow(() => sites.keywordOf(bad));
  }
});

test('商品IDを取り出す', () => {
  assert.strictEqual(sites.itemIdOf('https://jp.mercari.com/item/m12345678901'), 'm12345678901');
  assert.strictEqual(sites.itemIdOf('https://auctions.yahoo.co.jp/jp/auction/x1145141919'), 'x1145141919');
  assert.strictEqual(sites.itemIdOf('https://jp.mercari.com/search?keyword=x'), null);
});

test('検索キーワードを取り出す（パス形式も含む）', () => {
  assert.strictEqual(sites.keywordOf('https://jp.mercari.com/search?keyword=%E8%85%95%E6%99%82%E8%A8%88'), '腕時計');
  assert.strictEqual(sites.keywordOf('https://fril.jp/s?query=%E3%82%AB%E3%83%A1%E3%83%A9'), 'カメラ');
  assert.strictEqual(sites.keywordOf('https://paypayfleamarket.yahoo.co.jp/search/%E9%9D%B4'), '靴');
  assert.strictEqual(sites.keywordOf('https://jp.mercari.com/search?keyword=%20%20'), null);
});

test('横断検索は自サイトを除き、相場用の売り切れ検索は残す', () => {
  const links = sites.crossLinks('腕時計', 'mercari');
  const ids = links.map((l) => l.id);
  assert.ok(!ids.includes('mercari'), '自サイトの通常検索が残っている');
  assert.ok(ids.includes('mercari_sold'), '売り切れ検索は残すべき');
  assert.ok(links.every((l) => l.url.includes(encodeURIComponent('腕時計'))));
});

test('キーワードが空なら何も出さない', () => {
  assert.deepStrictEqual(sites.crossLinks('', 'mercari'), []);
  assert.deepStrictEqual(sites.crossLinks('   ', 'mercari'), []);
  assert.deepStrictEqual(sites.crossLinks(null, 'mercari'), []);
});

test('表示するサイトを絞り込める', () => {
  const links = sites.crossLinks('本', 'mercari', ['rakuma', 'google']);
  assert.deepStrictEqual(links.map((l) => l.id), ['rakuma', 'google']);
});

test('URLに使えない文字を含むキーワードを正しく組み立てる', () => {
  const [first] = sites.crossLinks('a&b=c #1', 'mercari');
  assert.ok(first.url.includes('a%26b%3Dc%20%231'), first.url);
});
