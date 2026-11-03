"""監視リスト（watchlist/current）の X アカウントごとに、直近N時間の公開投稿を取得して並べる。
1件だけでは低く見える投稿も、同じアカウントの流れで変化（悪化）を判断するための材料。
使い方: python3 -I watch_recent.py WATCHLIST_JSON OUT_JSON [hours=72] [追加のアカウント,カンマ区切り]
  WATCHLIST_JSON: ArtifactData get で保存した watchlist/current の JSON（data 包みでも可）
出力: {accounts:[{account, group, level, title, count, status, flagged:[...], latest:[...]}]}
判定はしない（読んだ人が行う）。本人への接触はしない。"""
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

UA = "Mozilla/5.0"
URL = "https://search.yahoo.co.jp/realtime/search?ei=UTF-8&p="
JST = timezone(timedelta(hours=9))
FLAG = re.compile(r"殺|ころす|コロス|[◯○〇●]す|56|4ね|タヒ|死ね|爆|放火|燃や|火.?瓶|刺す|刺し|銃|ナイフ|包丁|刃物|轢|襲|道連れ|天誅|決行|準備|待ち伏せ|出待ち|会いに行|乗り込|突撃"
                  r"|育樹祭|秋篠宮|皇嗣|悠仁|紀子|佳子|天皇|皇室|皇族|宮内庁|白浜|田辺|上富田|美浜|みなべ|新庄|明日|今夜|当日|\d{1,2}月\d{1,2}日")
SKIP = {"i", "home", "search", "intent", "hashtag", "share"}


def fetch(q):
    req = urllib.request.Request(URL + urllib.parse.quote(q), headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return []
    return json.loads(m.group(1))["props"]["pageProps"]["pageData"].get("timeline", {}).get("entry", []) or []


def handles(item):
    s = " ".join(str(item.get(k, "")) for k in ("platform", "url", "title"))
    if "5ch" in s and "x.com" not in s:
        return []
    hs = re.findall(r"x\.com/([A-Za-z0-9_]{1,15})", s) + re.findall(r"@([A-Za-z0-9_]{1,15})", s)
    out = []
    for h in hs:
        if h.lower() not in SKIP and h not in out:
            out.append(h)
    return out[:1]


def main():
    src, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 72
    wl = json.load(open(src, encoding="utf-8"))
    wl = wl.get("data", wl)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    extra = [{"url": "x.com/" + h.strip().lstrip("@"), "title": "前日のレポートの案件"}
             for h in (sys.argv[4].split(",") if len(sys.argv) > 4 else []) if h.strip()]
    res, done = [], set()
    for group, items in (("threats", wl.get("threats")), ("defamation", wl.get("defamation")), ("report", extra)):
        for it in items or []:
            for h in handles(it):
                if h.lower() in done:
                    continue
                done.add(h.lower())
                rec = {"account": "@" + h, "group": group, "level": it.get("level", ""),
                       "title": str(it.get("title", ""))[:120], "count": 0, "flagged": [], "latest": []}
                try:
                    ents = fetch("ID:" + h)
                    rec["status"] = "取得0件（凍結・削除・鍵・投稿なしの可能性）" if not ents else "ok"
                except Exception as e:
                    ents, rec["status"] = [], f"取得失敗: {e}"
                posts = []
                for e in ents:
                    if (e.get("screenName") or "").lower() != h.lower():
                        continue
                    ts = datetime.fromtimestamp(int(e["createdAt"]), timezone.utc)
                    if ts < cutoff:
                        continue
                    t = re.sub(r"\s+", " ", e.get("displayText") or e.get("text") or "").strip()
                    t = re.sub(r"\tSTART\t|\tEND\t", "", t)
                    posts.append({"time": ts.astimezone(JST).strftime("%m/%d %H:%M"),
                                  "text": t[:150], "url": f"https://x.com/{h}/status/{e['id']}"})
                rec["count"] = len(posts)
                if not posts and rec["status"] == "ok":
                    rec["status"] = f"直近{int(hours)}時間の投稿0件（凍結・削除・鍵の可能性も）"
                rec["flagged"] = [p for p in posts if FLAG.search(p["text"])][:10]
                rec["latest"] = [p for p in posts if p not in rec["flagged"]][:3]
                res.append(rec)
                time.sleep(1)
    json.dump({"hours": hours, "accounts": res}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"accounts={len(res)} flagged={sum(len(r['flagged']) for r in res)} zero={sum(1 for r in res if r['count']==0)}")


if __name__ == "__main__":
    main()
