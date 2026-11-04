"""Nostr（日本語圏も多い分散型SNS）の公開ノートを nostr.wine の検索APIで探し、直近N時間に絞る。
使い方: python3 -I nostr_search.py queries.txt out.jsonl [hours=24]
リンクは njump.me（ブラウザで読める公開ビューア）。投稿者の公開鍵（pubkey）はそのまま残すが、個人の特定はしない。"""
import json, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
API = "https://api.nostr.wine/search"


def main():
    qfile, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    cutoff = time.time() - hours * 3600
    seen = {}
    for q in [l.strip() for l in open(qfile, encoding="utf-8") if l.strip() and not l.startswith("#")]:
        url = API + "?" + urllib.parse.urlencode({"query": q, "kind": 1, "limit": 100, "sort": "time"})
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "osint-daily/1.0"}), timeout=25))
        except Exception as e:
            print(f"ERR {q}: {e}", file=sys.stderr); continue
        n = 0
        for e in d.get("data", []):
            if e.get("created_at", 0) < cutoff: continue
            n += 1
            r = seen.setdefault(e["id"], {"id": e["id"], "pubkey": e["pubkey"],
                                         "time_jst": datetime.fromtimestamp(e["created_at"], JST).strftime("%Y-%m-%d %H:%M"),
                                         "url": "https://njump.me/" + e["id"], "text": e.get("content", ""), "queries": []})
            r["queries"].append(q)
        print(f"{q}\t{n}件が{int(hours)}h以内", file=sys.stderr)
        time.sleep(1)
    with open(out, "w", encoding="utf-8") as f:
        for v in sorted(seen.values(), key=lambda v: v["time_jst"], reverse=True):
            f.write(json.dumps(v, ensure_ascii=False) + "\n")
    print(f"unique={len(seen)}", file=sys.stderr)


if __name__ == "__main__":
    main()
