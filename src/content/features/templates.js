/**
 * 定型文の挿入。
 *
 * ボタンをコメント欄の隣に挿し込むと、サイトの作りが変わるたびに消える。
 * ここでは画面端のパネルに置き、「最後に触れた入力欄」に差し込む。
 * 入力欄が見つからなければクリップボードに退避するので、操作が空振りしない。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});
  const { log, storage, ui } = FA;

  const SCOPE = 'templates';

  function groupByCategory(templates) {
    const groups = new Map();
    for (const template of templates) {
      const key = template.category || 'その他';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(template);
    }
    return groups;
  }

  async function apply(template) {
    const body = storage.render(template.body, FA.pageData.context());
    const field = ui.focusedField();

    if (field && ui.insertText(field, body)) {
      ui.toast(`「${template.label}」を入力しました`);
      return;
    }

    const copied = await ui.copy(body);
    ui.toast(copied
      ? `「${template.label}」をコピーしました（入力欄を選んでから押すと直接入力できます）`
      : 'コピーできませんでした。設定画面から本文を選択してコピーしてください。');
  }

  function render(settings) {
    ui.setSection(SCOPE, '定型文', (container) => {
      const templates = settings.templates || [];

      if (templates.length === 0) {
        container.appendChild(ui.el('p', {
          className: 'empty',
          textContent: '定型文がまだありません。設定画面から追加してください。',
        }));
        return;
      }

      container.appendChild(ui.el('p', {
        className: 'note',
        textContent: '入力欄をクリックしてから押すと、その場所に差し込みます。',
      }));

      for (const [category, items] of groupByCategory(templates)) {
        container.appendChild(ui.el('p', { className: 'cat', textContent: category }));

        for (const template of items) {
          const row = document.createElement('div');
          row.className = 'tpl';

          const insertButton = document.createElement('button');
          insertButton.type = 'button';
          insertButton.title = template.body;
          insertButton.appendChild(ui.el('span', { className: 'name', textContent: template.label }));
          insertButton.appendChild(ui.el('span', {
            className: 'preview',
            textContent: template.body.replace(/\s+/g, ' ').slice(0, 40),
          }));
          insertButton.addEventListener('click', () => {
            log.safeAsync(SCOPE, () => apply(template));
          });

          const copyButton = document.createElement('button');
          copyButton.type = 'button';
          copyButton.className = 'copy';
          copyButton.textContent = 'コピー';
          copyButton.title = 'クリップボードへコピー';
          copyButton.addEventListener('click', async () => {
            const text = storage.render(template.body, FA.pageData.context());
            const ok = await ui.copy(text);
            ui.toast(ok ? 'コピーしました' : 'コピーできませんでした');
          });

          row.appendChild(insertButton);
          row.appendChild(copyButton);
          container.appendChild(row);
        }
      }
    }, 20);
  }

  function run(_site, settings) {
    if (!settings.features.templates) {
      log.mark(SCOPE, 'skip', '設定で無効');
      ui.removeSection(SCOPE);
      return;
    }
    log.safe(SCOPE, () => render(settings));
    log.mark(SCOPE, 'ok', `${(settings.templates || []).length} 件`);
  }

  FA.features = FA.features || {};
  FA.features.templates = { run, groupByCategory };
})(typeof globalThis !== 'undefined' ? globalThis : this);
