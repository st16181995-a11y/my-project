/**
 * ポップアップ。何が動いていて、何が失敗したかを見せる。
 *
 * 「エラーで使えない」と言われる拡張の多くは、
 * 利用者が原因を確かめる手段を持たないことが本当の問題なので、
 * ここで切り分けられるようにしておく。
 */
(function () {
  const pageEl = document.getElementById('page');
  const healthEl = document.getElementById('health');

  const STATUS_LABEL = { ok: '動作中', skip: '対象外', error: '失敗' };
  const FEATURE_LABEL = {
    timestamps: '出品日時の表示',
    reactions: '反応数と再出品候補',
    templates: '定型文の挿入',
    crossSearch: '他サイトで探す',
    copyText: '情報のコピー',
    'page-data': 'ページ解析',
    boot: '起動',
    ui: '画面部品',
    storage: '設定の読み書き',
  };

  function el(tag, props, children) {
    const node = Object.assign(document.createElement(tag), props || {});
    for (const child of children || []) node.appendChild(child);
    return node;
  }

  function showMessage(target, message) {
    target.innerHTML = '';
    target.appendChild(el('p', { className: 'empty', textContent: message }));
  }

  function renderPage(data) {
    pageEl.innerHTML = '';
    const list = document.createElement('dl');

    const addRow = (label, value) => {
      list.appendChild(el('div', {}, [
        el('dt', { textContent: label }),
        el('dd', { textContent: value }),
      ]));
    };

    addRow('サイト', data.site || '対象外');
    addRow('商品ID', data.itemId || '（商品ページではありません）');
    addRow('埋め込みデータ', `${data.sourceCount} 件`);
    addRow('商品の索引', `${data.indexSize} 件`);

    pageEl.appendChild(list);
  }

  function renderHealth(health) {
    healthEl.innerHTML = '';

    if (!health || health.length === 0) {
      showMessage(healthEl, 'まだ記録がありません。ページを再読み込みしてください。');
      return;
    }

    const list = document.createElement('ul');
    const order = { error: 0, skip: 1, ok: 2 };
    const sorted = health.slice().sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

    for (const entry of sorted) {
      const label = FEATURE_LABEL[entry.feature] || entry.feature;
      const text = el('span', {}, [
        document.createTextNode(label),
        ...(entry.detail ? [el('span', { className: 'detail', textContent: entry.detail })] : []),
      ]);
      const pill = el('span', { className: 'pill', textContent: STATUS_LABEL[entry.status] || entry.status });
      pill.dataset.status = entry.status;
      list.appendChild(el('li', {}, [text, pill]));
    }

    healthEl.appendChild(list);
  }

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0];
  }

  async function ask(type) {
    const tab = await activeTab();
    if (!tab || tab.id == null) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, { type });
    } catch (_err) {
      // 対象外のページや、読み込み前のタブ。エラーではなく状態として扱う。
      return null;
    }
  }

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  document.getElementById('open-panel').addEventListener('click', async () => {
    const result = await ask('furimakit:togglePanel');
    if (result) window.close();
    else showMessage(pageEl, 'このページでは動作していません。メルカリ・ラクマ・ヤフオク・PayPayフリマを開いてお試しください。');
  });

  (async () => {
    const data = await ask('furimakit:diagnostics');
    if (!data) {
      showMessage(pageEl, 'このページでは動作していません。メルカリ・ラクマ・ヤフオク・PayPayフリマを開いてお試しください。');
      showMessage(healthEl, '—');
      return;
    }
    renderPage(data);
    renderHealth(data.health);
  })();
})();
