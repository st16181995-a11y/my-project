"""Misskey公開ノート検索（misskey.io）→ 直近N時間のみ。使い方: python3 -I misskey_search.py queries.txt out.jsonl [hours=24]"""
import json, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

def main():
    qfile, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    seen = {}
    for q in [l.strip() for l in open(qfile, encoding="utf-8") if l.strip() and not l.startswith("#")]:
        req = urllib.request.Request("https://misskey.io/api/notes/search", json.dumps({"query": q, "limit": 100}).encode(),
                                     {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
        try:
            notes = json.load(urllib.request.urlopen(req, timeout=20))
        except Exception as e:
            print(f"ERR {q}: {e}", file=sys.stderr); continue
        n = 0
        for x in notes:
            ts = datetime.fromisoformat(x["createdAt"].replace("Z", "+00:00"))
            if ts < cutoff: continue
            n += 1
            seen.setdefault(x["id"], {"time_jst": (ts + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M"),
                "user": x["user"]["username"], "url": f"https://misskey.io/notes/{x['id']}",
                "text": (x.get("text") or "")[:400], "queries": []})["queries"].append(q)
        print(f"{q}\t{len(notes)}件中{n}件が{hours:g}h以内", file=sys.stderr)
        time.sleep(1)
    with open(out, "w", encoding="utf-8") as f:
        for v in sorted(seen.values(), key=lambda v: v["time_jst"], reverse=True):
            f.write(json.dumps(v, ensure_ascii=False) + "\n")
    print(f"unique={len(seen)}", file=sys.stderr)
main()
