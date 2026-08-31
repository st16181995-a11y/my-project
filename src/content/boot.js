/**
 * 起動と、画面遷移への追随。
 *
 * 対象サイトはどれも SPA で、URL が変わっても再読み込みされない。
 * 拡張が「最初の 1 ページだけ効いて、あとは無反応」になるのはこれが原因。
 * URL の変化を監視して作り直す。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const { log, sites, storage, ui } = FA;

  const SCOPE = 'boot';
  const FEATURE_ORDER = ['timestamps', 'templates', 'crossSearch', 'copyText'];
  const MUTATION_DEBOUNCE_MS = 400;
  const POLL_MS = 1200;

  let settings = null;
  let site = null;
  let lastUrl = location.href;
  let debounceTimer = null;
  let started = false;

  function renderAll() {
    if (!settings) return;
    for (const name of FEATURE_ORDER) {
      const feature = FA.features && FA.features[name];
      if (!feature) continue;
      log.safe(name, () => feature.run(site, settings));
    }
  }

  /** 画面が書き換わっただけのとき。パネルは作り直さない（入力中の値が消えるため）。 */
  function refreshCards() {
    if (!settings || !settings.features.timestamps) return;
    const feature = FA.features && FA.features.timestamps;
    if (feature) log.safe('timestamps', () => feature.annotateCards(site, settings), 0);
  }

  function tick() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log.debug(SCOPE, `画面遷移: ${lastUrl}`);
      FA.pageData.reset();
      renderAll();
      return;
    }
    refreshCards();
  }

  function watch() {
    const target = document.body || document.documentElement;
    if (target) {
      const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => log.safe(SCOPE, tick), MUTATION_DEBOUNCE_MS);
      });
      observer.observe(target, { childList: true, subtree: true });
    }

    // pushState は content script 側からは捕まえられないので、取りこぼし用に定期確認。
    setInterval(() => log.safe(SCOPE, tick), POLL_MS);
    window.addEventListener('popstate', () => log.safe(SCOPE, tick));
  }

  function listenMessages() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== 'string') return false;

      if (message.type === 'furimakit:diagnostics') {
        const data = FA.pageData.get();
        sendResponse({
          url: location.href,
          site: site ? site.label : null,
          itemId: data.itemId,
          sourceCount: data.sources.length,
          indexSize: data.index.size,
          health: log.health(),
          entries: log.entries().slice(-60),
        });
        return false;
      }

      if (message.type === 'furimakit:togglePanel') {
        ui.togglePanel();
        sendResponse({ ok: true });
        return false;
      }

      return false;
    });
  }

  async function start() {
    if (started) return;
    started = true;

    site = sites.detect(location.href);
    if (!site) {
      log.mark(SCOPE, 'skip', '対象外のサイト');
      return;
    }

    settings = await log.safeAsync(SCOPE, () => storage.load(), storage.normalize(null));

    log.safe(SCOPE, () => {
      ui.ensureHost();
      ui.applySide(settings.panelSide);
      ui.trackFocus();
    });

    renderAll();
    watch();
    listenMessages();

    storage.onChange((next) => {
      settings = next;
      log.safe(SCOPE, () => ui.applySide(settings.panelSide));
      FA.pageData.reset();
      renderAll();
    });

    log.info(SCOPE, `${site.label} で起動しました`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => log.safeAsync(SCOPE, start));
  } else {
    log.safeAsync(SCOPE, start);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
