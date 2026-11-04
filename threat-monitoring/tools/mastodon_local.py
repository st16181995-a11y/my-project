"""Mastodon（既定 mstdn.jp）のローカル公開タイムラインを、直近N時間ぶんさかのぼって全件取得する。
使い方: python3 -I mastodon_local.py out.jsonl [hours=24] [host=mstdn.jp] [max_pages=300]"""
import html, json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))


def main():
    out = sys.argv[1]
    hours = float(sys.argv[2]) if len(sys.argv) > 2 else 24
    host = sys.argv[3] if len(sys.argv) > 3 else "mstdn.jp"
    maxp = int(sys.argv[4]) if len(sys.argv) > 4 else 300
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows, max_id = [], None
    for page in range(maxp):
        url = f"https://{host}/api/v1/timelines/public?local=true&limit=40" + (f"&max_id={max_id}" if max_id else "")
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "osint-daily/1.0"}), timeout=20))
        except Exception as e:
            print(f"ERR {e}", file=sys.stderr); time.sleep(5); continue
        if not d: break
        old = False
        for s in d:
            ts = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00"))
            if ts < cutoff: old = True; continue
            if s.get("reblog"): continue
            text = html.unescape(re.sub(r"<[^>]+>", " ", (s.get("spoiler_text") or "") + " " + s.get("content", "")))
            rows.append({"time_jst": ts.astimezone(JST).strftime("%Y-%m-%d %H:%M"), "url": s.get("url") or s.get("uri"),
                         "acct": s["account"]["acct"], "text": re.sub(r"\s+", " ", text).strip()[:600]})
        max_id = d[-1]["id"]
        if old: break
        time.sleep(1)
    with open(out, "w", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"host={host} pages={page + 1} statuses={len(rows)}", file=sys.stderr)


if __name__ == "__main__":
    main()
