/**
 * 商品情報のコピー。
 *
 * 再出品のとき、説明文を手で選択して写すのが地味に手間なので、
 * 説明文・商品名・URL をひと押しで取れるようにする。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const { log, ui } = FA;

  const SCOPE = 'copyText';

  /** 説明文。埋め込みデータを優先し、無ければ本文中の長いテキストから拾う。 */
  function description() {
    const data = FA.pageData.get();
    const node = data.itemNode;
    if (node) {
      for (const key of ['description', 'detail', 'body', 'itemDescription']) {
        const value = node[key];
        if (typeof value === 'string' && value.trim().length > 10) return value.trim();
      }
    }

    // 保険。商品ページの説明文は改行を含む長めの塊になっている。
    const candidates = document.querySelectorAll('main pre, main [data-testid*="description"], main p');
    let best = '';
    for (const element of candidates) {
      const text = (element.textContent || '').trim();
      if (text.length > best.length) best = text;
    }
    return best.length > 20 ? best : '';
  }

  function render() {
    ui.setSection(SCOPE, 'コピー', (container) => {
      const data = FA.pageData.get();

      if (!data.itemId) {
        container.appendChild(ui.el('p', {
          className: 'empty',
          textContent: '商品ページを開くと、商品名や説明文をまとめてコピーできます。',
        }));
        return;
      }

      const row = document.createElement('div');
      row.className = 'row';

      const addButton = (label, getText) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.textContent = label;
        button.addEventListener('click', async () => {
          const text = log.safe(SCOPE, getText, '');
          if (!text) {
            ui.toast(`${label}を取得できませんでした`);
            return;
          }
          const ok = await ui.copy(text);
          ui.toast(ok ? `${label}をコピーしました` : 'コピーできませんでした');
        });
        row.appendChild(button);
      };

      addButton('商品名', () => FA.pageData.itemName());
      addButton('説明文', () => description());
      addButton('URL', () => location.href.split('?')[0]);
      addButton('まとめて', () => {
        const parts = [FA.pageData.itemName(), '', description(), '', location.href.split('?')[0]];
        return parts.join('\n').trim();
      });

      container.appendChild(row);
    }, 40);
  }

  function run(_site, settings) {
    if (!settings.features.copyText) {
      log.mark(SCOPE, 'skip', '設定で無効');
      ui.removeSection(SCOPE);
      return;
    }
    log.safe(SCOPE, render);
    log.mark(SCOPE, 'ok', description() ? '説明文あり' : '説明文なし');
  }

  FA.features = FA.features || {};
  FA.features.copyText = { run, description };
})(typeof globalThis !== 'undefined' ? globalThis : this);
