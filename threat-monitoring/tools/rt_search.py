"""Yahoo!リアルタイム検索（X公開投稿）を複数クエリで取得し、直近N時間に絞って重複排除する。
使い方: python3 -I rt_search.py queries.txt out.jsonl [hours=24]
"""
import json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

UA = "Mozilla/5.0"
URL = "https://search.yahoo.co.jp/realtime/search?ei=UTF-8&p="


def fetch(q):
    req = urllib.request.Request(URL + urllib.parse.quote(q), headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return []
    d = json.loads(m.group(1))
    return d["props"]["pageProps"]["pageData"].get("timeline", {}).get("entry", []) or []


def main():
    qfile, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    queries = [l.strip() for l in open(qfile, encoding="utf-8") if l.strip() and not l.startswith("#")]
    seen = {}
    for q in queries:
        try:
            entries = fetch(q)
        except Exception as e:
            print(f"ERR {q}: {e}", file=sys.stderr)
            continue
        n = 0
        for e in entries:
            ts = datetime.fromtimestamp(int(e["createdAt"]), timezone.utc)
            if ts < cutoff:
                continue
            n += 1
            if e["id"] in seen:
                seen[e["id"]]["queries"].append(q)
                continue
            seen[e["id"]] = {
                "id": e["id"], "time_jst": (ts + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M"),
                "screenName": e.get("screenName"), "url": e.get("url"),
                "text": e.get("displayTextBody") or e.get("displayText"),
                "inReplyTo": e.get("inReplyTo"), "rt": e.get("rtCount"), "likes": e.get("likesCount"),
                "media": e.get("mediaType"), "queries": [q],
            }
        print(f"{q}\t{len(entries)}件中 {n}件が{hours:g}h以内", file=sys.stderr)
        time.sleep(1.5)
    with open(out, "w", encoding="utf-8") as f:
        for v in sorted(seen.values(), key=lambda x: x["time_jst"], reverse=True):
            f.write(json.dumps(v, ensure_ascii=False) + "\n")
    print(f"unique={len(seen)}", file=sys.stderr)


if __name__ == "__main__":
    main()
