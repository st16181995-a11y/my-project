/**
 * 日時の正規化と表示。
 *
 * フリマ各社が返す時刻は「秒」「ミリ秒」「ISO文字列」が混在し、
 * さらに仕様変更で単位が変わることがある。推測して表示すると
 * 「1970年」「55000年」のような明らかな誤表示になるので、
 * まず正規化し、ありえない値は捨てて何も出さない。
 */
(function (root) {
  const FA = (root.FA = root.FA || {});

  // フリマサービスの出品データとしてありうる範囲。外れたら信用しない。
  const MIN_MS = Date.UTC(2013, 0, 1);
  const FUTURE_SLACK_MS = 36 * 60 * 60 * 1000; // 時計ずれとタイムゾーン差の余裕

  /** 数値・文字列を Date に正規化する。信用できなければ null。 */
  function toDate(value) {
    let ms = null;

    if (typeof value === 'number' && Number.isFinite(value)) {
      ms = value >= 1e12 ? value : value >= 1e9 ? value * 1000 : null;
    } else if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d+$/.test(trimmed)) return toDate(Number(trimmed));
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) ms = parsed;
    } else if (value instanceof Date) {
      ms = value.getTime();
    }

    if (ms == null || !Number.isFinite(ms)) return null;
    if (ms < MIN_MS) return null;
    if (ms > Date.now() + FUTURE_SLACK_MS) return null;
    return new Date(ms);
  }

  const jst = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const jstShort = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  /** 2026/08/31 14:05 の形。null を渡したら空文字（呼び出し側で分岐させない）。 */
  function absolute(value, { short = false } = {}) {
    const date = toDate(value);
    if (!date) return '';
    return (short ? jstShort : jst).format(date).replace(/\s+/g, ' ');
  }

  /** 「3日前」。粗い表示なので、絶対日時の補助としてのみ使う。 */
  function relative(value, now = Date.now()) {
    const date = toDate(value);
    if (!date) return '';
    const diffSec = Math.max(0, Math.round((now - date.getTime()) / 1000));
    if (diffSec < 60) return 'たった今';
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}分前`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}時間前`;
    const day = Math.floor(hour / 24);
    if (day < 31) return `${day}日前`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month}ヶ月前`;
    return `${Math.floor(day / 365)}年前`;
  }

  /** 経過日数。再出品の判断材料に使う。 */
  function daysSince(value, now = Date.now()) {
    const date = toDate(value);
    if (!date) return null;
    return Math.floor((now - date.getTime()) / 86400000);
  }

  FA.format = { toDate, absolute, relative, daysSince };
  if (typeof module !== 'undefined' && module.exports) module.exports = FA.format;
})(typeof globalThis !== 'undefined' ? globalThis : this);
