"""爆サイ: 全地域×クエリでスレ検索 → 直近N時間に更新されたスレの最新ページから、N時間以内かつ加害語を含むレスを抽出。
使い方: python3 -I bakusai_search.py queries.txt out.jsonl [hours=24]
"""
import json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
AREAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20]
INTENT = re.compile(r"殺|ころ[すし]|コロ[スシ]|ｺﾛ|[◯○〇●]す|56[すし]|4ね|タヒ|ﾀﾋ|死ね|しね|爆破|爆弾|燃やす|放火|刺す|刺し|轢|道連れ|巻き込|無差別|襲")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")


def strip(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s.replace("<br />", "\n"))).strip()


def main():
    qfile, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    cutoff = datetime.now(JST) - timedelta(hours=hours)
    queries = [l.strip() for l in open(qfile, encoding="utf-8") if l.strip() and not l.startswith("#")]
    threads = {}
    for q in queries:
        for a in AREAS:
            try:
                h = get(f"https://bakusai.com/sch_all/acode={a}/word={urllib.parse.quote(q)}/")
            except Exception as e:
                print(f"ERR search {a} {q}: {e}", file=sys.stderr)
                continue
            for li in re.findall(r"<li>\s*<div class=\"search_thr_img_wrapper\">(.*?)</li>\s*(?=<li>|</ul>)", h, re.S):
                m = re.search(r'href="(/thr_res/[^"]+)".*?title="([^"]*)"', li, re.S)
                t = re.search(r"更新時間：(\d{4}/\d{2}/\d{2} \d{2}:\d{2})", li)
                if not (m and t):
                    continue
                ut = datetime.strptime(t.group(1), "%Y/%m/%d %H:%M").replace(tzinfo=JST)
                if ut >= cutoff:
                    threads.setdefault(m.group(1), {"title": m.group(2), "area": a, "queries": set()})["queries"].add(q)
            time.sleep(0.8)
        print(f"{q}: 24h内更新スレ累計 {len(threads)}", file=sys.stderr)
    n = 0
    with open(out, "w", encoding="utf-8") as f:
        for path, info in threads.items():
            try:
                h = get("https://bakusai.com" + path)
            except Exception as e:
                print(f"ERR thr {path}: {e}", file=sys.stderr)
                continue
            for blk in re.findall(r'id="res(\d+)"(.*?)(?=id="res\d+"|</dl>)', h, re.S):
                num, body = blk
                t = re.search(r'itemprop="commentTime">([^<]+)<', body)
                c = re.search(r'itemprop="commentText">(.*?)</div>', body, re.S)
                if not (t and c):
                    continue
                try:
                    ts = datetime.strptime(t.group(1).strip(), "%Y/%m/%d %H:%M").replace(tzinfo=JST)
                except ValueError:
                    continue
                text = strip(c.group(1))
                if ts >= cutoff and INTENT.search(text):
                    n += 1
                    f.write(json.dumps({"time_jst": ts.strftime("%Y-%m-%d %H:%M"), "url": f"https://bakusai.com{path}#res{num}",
                                        "thread": info["title"], "area": info["area"], "text": text,
                                        "queries": sorted(info["queries"])}, ensure_ascii=False) + "\n")
            time.sleep(0.8)
    print(f"threads={len(threads)} hits={n}", file=sys.stderr)


if __name__ == "__main__":
    main()
