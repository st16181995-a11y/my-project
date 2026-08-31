/**
 * 診断ログと安全実行。
 *
 * この拡張が守る一番の約束は「壊れても、閲覧しているページを壊さない」こと。
 * 機能はすべて safe() 経由で呼び、失敗はその機能だけを止めて記録する。
 * 記録は設定画面の「診断」に出るので、サイト側の変更で何が壊れたか人間が見て分かる。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});

  const MAX_ENTRIES = 200;
  const entries = [];
  // 機能名 -> { status: 'ok'|'skip'|'error', detail, at }
  const health = new Map();

  function push(level, scope, message, detail) {
    entries.push({ level, scope, message, detail: detail == null ? null : String(detail), at: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.shift();
  }

  const log = {
    debug: (scope, message, detail) => push('debug', scope, message, detail),
    info: (scope, message, detail) => push('info', scope, message, detail),
    warn: (scope, message, detail) => push('warn', scope, message, detail),
    error: (scope, message, detail) => push('error', scope, message, detail),

    entries: () => entries.slice(),
    clear: () => {
      entries.length = 0;
      health.clear();
    },

    /** 機能の健康状態を記録する。ok = 動いた / skip = 対象外 / error = 壊れた */
    mark(feature, status, detail) {
      health.set(feature, { status, detail: detail == null ? null : String(detail), at: Date.now() });
    },
    health: () => Array.from(health, ([feature, v]) => Object.assign({ feature }, v)),

    /**
     * fn を実行し、例外が出ても握りつぶして fallback を返す。
     * 1 機能の失敗が他機能やページ本体に波及しないための境界。
     */
    safe(scope, fn, fallback) {
      try {
        return fn();
      } catch (err) {
        push('error', scope, (err && err.message) || '不明なエラー', err && err.stack);
        log.mark(scope, 'error', (err && err.message) || '不明なエラー');
        return fallback;
      }
    },

    async safeAsync(scope, fn, fallback) {
      try {
        return await fn();
      } catch (err) {
        push('error', scope, (err && err.message) || '不明なエラー', err && err.stack);
        log.mark(scope, 'error', (err && err.message) || '不明なエラー');
        return fallback;
      }
    },
  };

  FA.log = log;
  if (typeof module !== 'undefined' && module.exports) module.exports = log;
})(typeof globalThis !== 'undefined' ? globalThis : this);
