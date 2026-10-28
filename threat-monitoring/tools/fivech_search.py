"""5ch: 指定板の直近更新スレのdatを取得 → 直近N時間のレスのうち加害語を含むものを抽出。
使い方: python3 -I fivech_search.py boards.txt out.jsonl [hours=24] [threads_per_board=40]
boards.txt: 板ディレクトリ名を1行ずつ（例 newsplus）。メニューJSONでサーバーを解決する。"""
import json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
INTENT = re.compile(r"殺|ころ[すし]|コロ[スシ]|ｺﾛ|[◯○〇●]す|56[すし]|4ね|タヒ|ﾀﾋ|死ね|しね|爆破|爆弾|燃やす|放火|刺す|刺し|轢|道連れ|巻き込|無差別|襲撃|テロ|待ち伏せ|出待ち|乗り込|突撃|ペットボトル|育樹祭|秋篠宮")
DATE = re.compile(r"(\d{4})/(\d{2})/(\d{2})\(.\) (\d{2}):(\d{2}):(\d{2})")


def get(url, enc=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=25).read()
    return raw if enc is None else raw.decode(enc, "replace")


def clean(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s.replace("<br>", "\n"))).strip()


def main():
    bfile, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    per = int(sys.argv[4]) if len(sys.argv) > 4 else 40
    cutoff = datetime.now(JST) - timedelta(hours=hours)
    menu = json.loads(get("https://menu.5ch.io/bbsmenu.json", "utf-8"))
    base = {}
    for c in menu["menu_list"]:
        for b in c.get("category_content", []):
            base[b["directory_name"]] = (b["url"].rstrip("/"), b["board_name"])
    n_res = hits = 0
    with open(out, "w", encoding="utf-8") as f:
        for d in [l.strip() for l in open(bfile, encoding="utf-8") if l.strip() and not l.startswith("#")]:
            if d not in base:
                print(f"板なし: {d}", file=sys.stderr); continue
            url, name = base[d]
            try:
                subj = get(url + "/subject.txt", "cp932").splitlines()
            except Exception as e:
                print(f"ERR {d}: {e}", file=sys.stderr); continue
            got = 0
            for line in subj[:per]:
                m = re.match(r"(\d+)\.dat<>(.*) \((\d+)\)$", line)
                if not m: continue
                tid, title = m.group(1), m.group(2)
                try:
                    dat = get(f"{url}/dat/{tid}.dat", "cp932").splitlines()
                except Exception:
                    continue
                got += 1
                for i, row in enumerate(dat, 1):
                    p = row.split("<>")
                    if len(p) < 4: continue
                    dm = DATE.search(p[2])
                    if not dm: continue
                    ts = datetime(*map(int, dm.groups()), tzinfo=JST)
                    if ts < cutoff: continue
                    n_res += 1
                    text = clean(p[3])
                    if INTENT.search(text):
                        hits += 1
                        f.write(json.dumps({"time_jst": ts.strftime("%Y-%m-%d %H:%M"), "board": f"{name}({d})", "thread": title,
                                            "url": f"https://{url.split('/')[2]}/test/read.cgi/{d}/{tid}/{i}",
                                            "res": i, "text": text[:400]}, ensure_ascii=False) + "\n")
                time.sleep(0.4)
            print(f"{name}({d}): {got}スレ取得", file=sys.stderr)
    print(f"24h内レス={n_res} 加害語ヒット={hits}", file=sys.stderr)


main()
