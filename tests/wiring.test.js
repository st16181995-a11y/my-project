/**
 * 配線の確認。
 *
 * 個々の関数が正しくても、機能名の綴りがひとつずれるだけで
 * 「設定は出るのに動かない」という分かりにくい壊れ方をする。
 * ブラウザなしで確かめられる範囲を、ここで押さえる。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(rootDir, relative), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('マニフェストが指すファイルはすべて実在する', () => {
  const entry = manifest.content_scripts[0];
  const files = [...entry.js, ...entry.css, manifest.options_ui.page, manifest.action.default_popup];
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(rootDir, file)), `${file} がない`);
  }
});

test('共通モジュールは機能より先に読み込まれる', () => {
  const js = manifest.content_scripts[0].js;
  const indexOf = (name) => js.findIndex((file) => file.endsWith(name));
  for (const dependency of ['log.js', 'format.js', 'extract.js', 'sites.js', 'storage.js', 'ui.js', 'page-data.js']) {
    assert.ok(indexOf(dependency) >= 0, `${dependency} が読み込まれていない`);
    assert.ok(
      indexOf(dependency) < indexOf('timestamps.js'),
      `${dependency} は機能より先に読む必要がある`
    );
  }
  assert.strictEqual(js[js.length - 1], 'src/content/boot.js', 'boot.js は最後に読む');
});

test('boot が回す機能名と、実際の登録名が一致する', () => {
  const boot = read('src/content/boot.js');
  const declared = boot.match(/const FEATURE_ORDER = \[([^\]]+)\]/)[1]
    .split(',')
    .map((part) => part.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  const featureFiles = manifest.content_scripts[0].js.filter((file) => file.includes('/features/'));
  const registered = new Set();
  for (const file of featureFiles) {
    for (const match of read(file).matchAll(/FA\.features\.(\w+)\s*=/g)) registered.add(match[1]);
  }

  assert.deepStrictEqual(new Set(declared), registered, '登録名と実行順の一覧がずれている');
});

test('設定の機能フラグと、boot が回す機能名が一致する', () => {
  const storage = require('../src/common/storage.js');
  const boot = read('src/content/boot.js');
  const declared = boot.match(/const FEATURE_ORDER = \[([^\]]+)\]/)[1]
    .split(',')
    .map((part) => part.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  assert.deepStrictEqual(
    Object.keys(storage.DEFAULTS.features).sort(),
    declared.slice().sort(),
    '設定に無い機能、または設定にしか無い機能がある'
  );
});

test('設定画面に、すべての機能の説明がある', () => {
  const storage = require('../src/common/storage.js');
  const options = read('src/options/options.js');
  const labels = options.match(/const FEATURE_LABELS = \{([\s\S]*?)\n  \};/)[1];
  for (const key of Object.keys(storage.DEFAULTS.features)) {
    assert.ok(new RegExp(`\\b${key}:`).test(labels), `${key} の説明が設定画面にない`);
  }
});

test('横断検索の行き先は、設定画面と実装で同じ一覧を使う', () => {
  const sites = require('../src/common/sites.js');
  assert.ok(sites.SEARCH_TARGETS.length > 0);
  for (const target of sites.SEARCH_TARGETS) {
    assert.ok(target.id && target.label && typeof target.url === 'function', `${target.id} の定義が不完全`);
    assert.ok(target.url('テスト').startsWith('https://'), `${target.id} が https でない`);
  }
});

test('自動操作につながる権限を要求していない', () => {
  const permissions = manifest.permissions || [];
  for (const risky of ['tabs', 'webRequest', 'scripting', 'cookies', 'history']) {
    assert.ok(!permissions.includes(risky), `${risky} は不要`);
  }
  assert.ok(!manifest.background, '常駐処理は持たない');
});

/**
 * 権限を絞っていても、ページ内で人の代わりにボタンを押せてしまえば同じこと。
 * 「送信するのは常に人」という約束を、README ではなくコードの側で留める。
 * 入力欄へ文字を入れる Event（ui.insertText）は対象外。あれは押していない。
 */
test('コンテンツスクリプトが、人の代わりに押したり送ったりしていない', () => {
  const banned = [
    [/\.click\s*\(/, '要素のクリック'],
    [/\.submit\s*\(/, 'フォームの送信'],
    [/requestSubmit/, 'フォームの送信'],
    [/new\s+(Mouse|Pointer)Event/, 'クリックの偽装'],
    [/XMLHttpRequest|\bfetch\s*\(/, 'サイトへの直接リクエスト'],
  ];

  for (const file of manifest.content_scripts[0].js) {
    const source = read(file);
    for (const [pattern, why] of banned) {
      assert.ok(!pattern.test(source), `${file} に${why}がある。送信は人が行う約束を崩している`);
    }
  }
});

test('出張セールの定型文が、指定どおりの本文で入っている', () => {
  const storage = require('../src/common/storage.js');
  const template = storage.DEFAULT_TEMPLATES.find((t) => t.id === 't_trip_sale');
  assert.ok(template, '出張セールの定型文がない');
  assert.strictEqual(
    template.body,
    '🚨【出張期間限定・大幅値下げ】🚨\n'
      + '\n'
      + '出張のため、しばらく即日発送ができません✈️\n'
      + 'その代わりに、期間限定で一気にお値下げいたします🔥\n'
      + '\n'
      + '📦 次回の発送は【9月21日（月）】となります！\n'
      + '\n'
      + '発送までお待ちいただける方は、\n'
      + 'ぜひこの機会にお得にご購入ください✨'
  );
});
