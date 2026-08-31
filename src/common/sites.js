/**
 * 対応サイトの定義と、横断検索の URL 組み立て。
 *
 * サイト判定は「ホスト名 + URL の形」だけに頼る。
 * CSS クラス名やページ内の文言は各社が頻繁に変えるため、判定材料にしない。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});

  const SITES = {
    mercari: {
      id: 'mercari',
      label: 'メルカリ',
      hosts: [/^jp\.mercari\.com$/],
      itemPatterns: [/\/item\/(m\d+)/, /\/shops\/product\/([A-Za-z0-9]+)/],
      keywordParams: ['keyword', 'q'],
      search: (kw, { sold = false } = {}) =>
        `https://jp.mercari.com/search?keyword=${encodeURIComponent(kw)}` + (sold ? '&status=sold_out' : ''),
    },
    rakuma: {
      id: 'rakuma',
      label: 'ラクマ',
      hosts: [/^fril\.jp$/, /^rakuma\.rakuten\.co\.jp$/],
      itemPatterns: [/\/item\/([A-Za-z0-9_-]+)/, /^\/([a-z0-9]{10,})\/?$/],
      keywordParams: ['query', 'q'],
      search: (kw, { sold = false } = {}) =>
        `https://fril.jp/s?query=${encodeURIComponent(kw)}` + (sold ? '&transaction=soldout' : ''),
    },
    yahuoku: {
      id: 'yahuoku',
      label: 'ヤフオク',
      hosts: [/^auctions\.yahoo\.co\.jp$/],
      itemPatterns: [/\/auction\/([A-Za-z0-9]+)/],
      keywordParams: ['p', 'va'],
      search: (kw, { sold = false } = {}) =>
        sold
          ? `https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(kw)}`
          : `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(kw)}`,
    },
    paypay: {
      id: 'paypay',
      label: 'PayPayフリマ',
      hosts: [/^paypayfleamarket\.yahoo\.co\.jp$/],
      itemPatterns: [/\/item\/([A-Za-z0-9]+)/],
      keywordParams: ['query', 'p'],
      search: (kw) => `https://paypayfleamarket.yahoo.co.jp/search/${encodeURIComponent(kw)}`,
    },
  };

  // 横断検索の行き先。相場を見るための「売り切れ」検索を既定で含める。
  const SEARCH_TARGETS = [
    { id: 'mercari_sold', label: 'メルカリ 売切', hint: '相場の確認', url: (kw) => SITES.mercari.search(kw, { sold: true }) },
    { id: 'mercari', label: 'メルカリ', url: (kw) => SITES.mercari.search(kw) },
    { id: 'rakuma', label: 'ラクマ', url: (kw) => SITES.rakuma.search(kw) },
    { id: 'yahuoku_sold', label: 'ヤフオク 落札', hint: '相場の確認', url: (kw) => SITES.yahuoku.search(kw, { sold: true }) },
    { id: 'yahuoku', label: 'ヤフオク', url: (kw) => SITES.yahuoku.search(kw) },
    { id: 'paypay', label: 'PayPayフリマ', url: (kw) => SITES.paypay.search(kw) },
    { id: 'amazon', label: 'Amazon', url: (kw) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(kw)}` },
    { id: 'rakuten', label: '楽天市場', url: (kw) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(kw)}/` },
    { id: 'google', label: 'Google', url: (kw) => `https://www.google.com/search?q=${encodeURIComponent(kw)}` },
  ];

  function detect(url) {
    let parsed;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch (_err) {
      return null;
    }
    if (!parsed || !parsed.hostname) return null;

    for (const site of Object.values(SITES)) {
      if (site.hosts.some((re) => re.test(parsed.hostname))) return site;
    }
    return null;
  }

  /** URL から商品 ID を取り出す。取れなければ null（推測しない）。 */
  function itemIdOf(url, site) {
    let parsed;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch (_err) {
      return null;
    }
    const target = site || detect(parsed);
    if (!target || !parsed) return null;

    for (const pattern of target.itemPatterns) {
      const match = parsed.pathname.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  /** 検索キーワードを URL から拾う。パス形式（PayPayフリマ）にも対応。 */
  function keywordOf(url, site) {
    let parsed;
    try {
      parsed = typeof url === 'string' ? new URL(url) : url;
    } catch (_err) {
      return null;
    }
    const target = site || detect(parsed);
    if (!target || !parsed) return null;

    for (const param of target.keywordParams) {
      const value = parsed.searchParams.get(param);
      if (value && value.trim()) return value.trim();
    }

    const pathMatch = parsed.pathname.match(/\/search\/([^/?#]+)/);
    if (pathMatch) {
      try {
        const decoded = decodeURIComponent(pathMatch[1]).trim();
        if (decoded) return decoded;
      } catch (_err) {
        /* 壊れたエスケープは無視 */
      }
    }
    return null;
  }

  /** 自分自身のサイトは除いた横断検索リンクを返す。 */
  function crossLinks(keyword, currentSiteId, enabledIds) {
    if (!keyword || !keyword.trim()) return [];
    const kw = keyword.trim();
    return SEARCH_TARGETS.filter((target) => {
      if (enabledIds && enabledIds.length && !enabledIds.includes(target.id)) return false;
      return target.id !== currentSiteId;
    }).map((target) => ({ id: target.id, label: target.label, hint: target.hint || '', url: target.url(kw) }));
  }

  FA.sites = { SITES, SEARCH_TARGETS, detect, itemIdOf, keywordOf, crossLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = FA.sites;
})(typeof globalThis !== 'undefined' ? globalThis : this);
