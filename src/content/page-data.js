/**
 * ページ 1 枚ぶんの商品データを、1 回だけ読んで使い回す。
 *
 * 埋め込み JSON の走査は安くないので、機能ごとに読み直さない。
 * URL が変わったら捨てる（SPA なので画面遷移で DOM ごと入れ替わる）。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const { log, format, extract, sites } = FA;

  const SCOPE = 'page-data';
  const INLINE_SCRIPT_LIMIT = 1.5 * 1024 * 1024;
  const MAX_INLINE_SCRIPTS = 12;

  let cache = null;

  function collectSources() {
    const sources = [];

    const jsonScripts = document.querySelectorAll(
      'script#__NEXT_DATA__, script[type="application/json"], script[type="application/ld+json"]'
    );
    for (const script of jsonScripts) {
      const text = script.textContent;
      if (!text || text.length > INLINE_SCRIPT_LIMIT) continue;
      try {
        sources.push(JSON.parse(text));
      } catch (_err) {
        // JSON でない中身のこともある。次へ。
      }
    }

    // 素の JSON として置かれていない場合の保険。走査量に上限を設ける。
    let scanned = 0;
    for (const script of document.querySelectorAll('script:not([src])')) {
      if (scanned >= MAX_INLINE_SCRIPTS) break;
      const text = script.textContent;
      if (!text || text.length > INLINE_SCRIPT_LIMIT) continue;
      if (!/["']?(created|createdAt|created_at)["']?\s*[:=]/.test(text)) continue;
      scanned++;
      for (const obj of extract.jsonObjectsIn(text, { max: 12 })) sources.push(obj);
    }

    return sources;
  }

  function build() {
    const site = sites.detect(location.href);
    const itemId = site ? sites.itemIdOf(location.href, site) : null;
    const sources = collectSources();
    const index = extract.indexItems(sources);

    let itemNode = null;
    if (itemId) {
      for (const source of sources) {
        itemNode = extract.findItemNode(source, itemId);
        if (itemNode) break;
      }
    }

    log.debug(SCOPE, `埋め込みデータ ${sources.length} 件 / 商品索引 ${index.size} 件 / 商品ノード ${itemNode ? 'あり' : 'なし'}`);
    return { url: location.href, site, itemId, sources, index, itemNode };
  }

  function get() {
    if (!cache || cache.url !== location.href) cache = build();
    return cache;
  }

  function reset() {
    cache = null;
  }

  /** 見出しから商品名を取る。h1 はクラス名よりずっと変わりにくい。 */
  function itemName() {
    const data = get();
    if (data.itemNode) {
      const value = data.itemNode.name || data.itemNode.title;
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    const heading = document.querySelector('main h1') || document.querySelector('h1');
    return heading ? heading.textContent.trim().slice(0, 120) : '';
  }

  function itemPrice() {
    const data = get();
    if (!data.itemNode) return '';
    const raw = data.itemNode.price;
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.round(raw));
    if (typeof raw === 'string' && /^\d+$/.test(raw.replace(/[,\s円]/g, ''))) {
      return raw.replace(/[,\s円]/g, '');
    }
    return '';
  }

  /** 定型文に差し込む値。取れなかった項目は空にして、変数を残させる。 */
  function context() {
    const data = get();
    const created = data.itemNode ? (data.itemNode.created ?? data.itemNode.createdAt) : null;
    return {
      商品名: itemName(),
      価格: itemPrice(),
      日付: format.absolute(Date.now()).split(' ')[0],
      出品日: created ? format.absolute(created).split(' ')[0] : '',
    };
  }

  FA.pageData = { get, reset, collectSources, itemName, itemPrice, context };
})(typeof globalThis !== 'undefined' ? globalThis : this);
