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
  let scriptCount = 0;
  let refreshCount = 0;
  const MAX_REFRESH = 8; // 際限なく作り直さないための上限

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

    scriptCount = document.querySelectorAll('script').length;
    log.debug(SCOPE, `埋め込みデータ ${sources.length} 件 / 商品索引 ${index.size} 件 / 商品ノード ${itemNode ? 'あり' : 'なし'}`);
    return { url: location.href, site, itemId, sources, index, itemNode };
  }

  function get() {
    if (!cache || cache.url !== location.href) {
      refreshCount = 0;
      cache = build();
    }
    return cache;
  }

  /**
   * データが後から届く場合に読み直す。
   *
   * 対象サイトは本文を分割して流し込むため、読み込み直後の 1 回だけ見ても
   * 商品データが揃っていないことがある。「たまに表示されない」の実態はこれ。
   * script タグが増えていたら集め直し、拾えるようになったかを呼び出し側へ返す。
   */
  function maybeRefresh() {
    if (!cache || cache.url !== location.href) {
      get();
      return true;
    }
    if (refreshCount >= MAX_REFRESH) return false;
    if (document.querySelectorAll('script').length === scriptCount) return false;

    refreshCount++;
    const before = cache.index.size;
    const hadItemNode = !!cache.itemNode;
    cache = build();

    // 「商品が増えた」か「商品ノードを新たに拾えた」ときだけ再挑戦させる。
    // 変化が無いのに毎回やり直すと、無駄に DOM を触り続けることになる。
    const grew = cache.index.size > before || (!hadItemNode && !!cache.itemNode);
    log.debug(SCOPE, `埋め込みデータを読み直しました（${refreshCount}回目、索引 ${before} → ${cache.index.size}）`);
    return grew;
  }

  function reset() {
    cache = null;
    refreshCount = 0;
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

  FA.pageData = { get, reset, maybeRefresh, collectSources, itemName, itemPrice, context };
})(typeof globalThis !== 'undefined' ? globalThis : this);
