"""ニコニコ動画 スナップショット検索API → 直近N時間に投稿された動画のタイトル/説明文のみ（コメントは対象外）。
使い方: python3 -I nico_search.py queries.txt out.jsonl [hours=24]"""
import json, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
API = "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search"

def main():
    qfile, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    since = (datetime.now(JST) - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S+09:00")
    seen = {}
    for q in [l.strip() for l in open(qfile, encoding="utf-8") if l.strip() and not l.startswith("#")]:
        params = {"q": q, "targets": "title,description,tags", "_sort": "-startTime", "_limit": 100,
                  "fields": "contentId,title,description,startTime,tags,viewCounter",
                  "filters[startTime][gte]": since, "_context": "osint-daily"}
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": "osint-daily/1.0"})
        try:
            d = json.load(urllib.request.urlopen(req, timeout=20))
        except Exception as e:
            print(f"ERR {q}: {e}", file=sys.stderr); continue
        for x in d["data"]:
            seen.setdefault(x["contentId"], {**x, "url": f"https://www.nicovideo.jp/watch/{x['contentId']}", "queries": []})["queries"].append(q)
        print(f"{q}\t{len(d['data'])}件（total {d['meta'].get('totalCount')}）", file=sys.stderr)
        time.sleep(1)
    with open(out, "w", encoding="utf-8") as f:
        for v in sorted(seen.values(), key=lambda v: v["startTime"], reverse=True):
            f.write(json.dumps(v, ensure_ascii=False) + "\n")
    print(f"unique={len(seen)}", file=sys.stderr)
main()
