"""はてな匿名ダイアリーの新着を、直近N時間ぶんページをさかのぼって全件取得する（記事IDが投稿時刻）。
使い方: python3 -I anond_latest.py out.jsonl [hours=24] [max_pages=200]"""
import html, json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))


def main():
    out = sys.argv[1]
    hours = float(sys.argv[2]) if len(sys.argv) > 2 else 24
    maxp = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    cutoff = (datetime.now(JST) - timedelta(hours=hours)).strftime("%Y%m%d%H%M%S")
    rows, seen, stop = [], set(), False
    for page in range(1, maxp + 1):
        try:
            h = urllib.request.urlopen(urllib.request.Request(f"https://anond.hatelabo.jp/?page={page}", headers={"User-Agent": "Mozilla/5.0"}), timeout=20).read().decode("utf-8", "replace")
        except Exception as e:
            print(f"ERR page {page}: {e}", file=sys.stderr); time.sleep(3); continue
        secs = h.split('class="section"')[1:]
        if not secs: break
        for s in secs:
            m = re.search(r'href="/(\d{14})"', s)
            if not m: continue
            aid = m.group(1)
            if aid < cutoff: stop = True; continue
            if aid in seen: continue
            seen.add(aid)
            body = s.split('class="sectionfooter"')[0]
            body = re.sub(r'<div class="ad-in-entry-block".*?</div>', " ", body, flags=re.S)
            text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body))).replace("■", "").strip()
            rows.append({"id": aid, "time_jst": f"{aid[:4]}-{aid[4:6]}-{aid[6:8]} {aid[8:10]}:{aid[10:12]}",
                         "url": f"https://anond.hatelabo.jp/{aid}", "text": text[:1500]})
        if stop: break
        time.sleep(0.7)
    with open(out, "w", encoding="utf-8") as f:
        for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"pages={page} entries={len(rows)}", file=sys.stderr)


if __name__ == "__main__":
    main()
