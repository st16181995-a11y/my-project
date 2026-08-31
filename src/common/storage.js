/**
 * 設定の保存。chrome.storage.local を使い、無い環境ではメモリに退避する。
 *
 * 保存済みの設定は「壊れている前提」で読む。拡張の更新や手動編集で
 * 型が変わっていても、既定値へ寄せて必ず使える形にして返す。
 * 設定の読み込み失敗で拡張全体が起動しないのが、この手のツールの
 * よくある詰まり方なので、ここで確実に殺しておく。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});

  const KEY = 'furimakit';
  const SCHEMA_VERSION = 1;

  const DEFAULT_TEMPLATES = [
    { id: 't_greet', category: 'コメント', label: 'コメント返信', body: 'コメントありがとうございます。\n{商品名}についてですね、確認いたしますので少々お待ちください。' },
    { id: 't_price_ok', category: 'コメント', label: '値下げ 応じる', body: 'コメントありがとうございます。\n{価格}円まででしたらお値下げ可能です。よろしければ専用ページをご用意します。' },
    { id: 't_price_ng', category: 'コメント', label: '値下げ 断る', body: 'コメントありがとうございます。\n申し訳ありませんが、現在のお値段が精一杯となります。ご検討いただけますと幸いです。' },
    { id: 't_hold', category: 'コメント', label: '専用ページ', body: 'お待たせしました。{商品名}の専用ページに変更いたしました。\nお手すきの際にご購入手続きをお願いいたします。' },
    { id: 't_ship', category: 'コメント', label: '発送について', body: 'ご購入ありがとうございます。\n{日付}中に発送の手配をいたします。到着まで今しばらくお待ちください。' },
    { id: 't_desc', category: '商品説明', label: '説明文ひな形', body: 'ご覧いただきありがとうございます。\n\n【商品状態】\n\n【サイズ】\n\n【発送について】\n簡易包装にて、ご購入から1〜2日以内に発送いたします。\n\n【注意事項】\n素人保管のため、細かな傷や汚れがある場合があります。\n神経質な方はご購入をお控えください。' },
  ];

  const DEFAULTS = {
    version: SCHEMA_VERSION,
    features: { timestamps: true, templates: true, crossSearch: true, copyText: true },
    templates: DEFAULT_TEMPLATES,
    crossSearchTargets: [], // 空 = 全部出す
    showRelative: true,
    panelSide: 'right',
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** 読み出した値を既定値の形に矯正する。壊れた項目だけを既定に戻す。 */
  function normalize(raw) {
    const out = clone(DEFAULTS);
    if (!raw || typeof raw !== 'object') return out;

    if (raw.features && typeof raw.features === 'object') {
      for (const key of Object.keys(out.features)) {
        if (typeof raw.features[key] === 'boolean') out.features[key] = raw.features[key];
      }
    }

    if (Array.isArray(raw.templates)) {
      const templates = raw.templates
        .filter((t) => t && typeof t === 'object' && typeof t.body === 'string')
        .map((t, index) => ({
          id: typeof t.id === 'string' && t.id ? t.id : `t_${Date.now()}_${index}`,
          category: typeof t.category === 'string' && t.category ? t.category : 'その他',
          label: typeof t.label === 'string' && t.label ? t.label : `定型文 ${index + 1}`,
          body: t.body,
        }));
      out.templates = templates; // 空配列も利用者の意思として尊重する
    }

    if (Array.isArray(raw.crossSearchTargets)) {
      out.crossSearchTargets = raw.crossSearchTargets.filter((id) => typeof id === 'string');
    }
    if (typeof raw.showRelative === 'boolean') out.showRelative = raw.showRelative;
    if (raw.panelSide === 'left' || raw.panelSide === 'right') out.panelSide = raw.panelSide;

    return out;
  }

  const memory = { value: null };

  function hasChromeStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  async function load() {
    if (!hasChromeStorage()) return normalize(memory.value);
    try {
      const bag = await chrome.storage.local.get(KEY);
      return normalize(bag && bag[KEY]);
    } catch (err) {
      if (FA.log) FA.log.warn('storage', '設定を読めませんでした。既定値で動作します。', err && err.message);
      return clone(DEFAULTS);
    }
  }

  async function save(settings) {
    const normalized = normalize(settings);
    normalized.version = SCHEMA_VERSION;
    if (!hasChromeStorage()) {
      memory.value = normalized;
      return normalized;
    }
    await chrome.storage.local.set({ [KEY]: normalized });
    return normalized;
  }

  async function patch(partial) {
    const current = await load();
    return save(Object.assign(current, partial));
  }

  function onChange(handler) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) return () => {};
    const listener = (changes, area) => {
      if (area !== 'local' || !changes[KEY]) return;
      handler(normalize(changes[KEY].newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  /** 定型文の差し込み。未知の変数はそのまま残す（消すと事故に見える）。 */
  function render(body, context) {
    if (typeof body !== 'string') return '';
    const ctx = context || {};
    return body.replace(/\{(商品名|価格|日付|出品日)\}/g, (whole, key) => {
      const value = ctx[key];
      return value === undefined || value === null || value === '' ? whole : String(value);
    });
  }

  FA.storage = { KEY, DEFAULTS, DEFAULT_TEMPLATES, SCHEMA_VERSION, normalize, load, save, patch, onChange, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = FA.storage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
