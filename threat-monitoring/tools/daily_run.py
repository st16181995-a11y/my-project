"""毎朝の収集: X(Yahoo!リアルタイム)・Misskey・ニコニコ・5chを並列で取得し、候補を絞って candidates.json を出す。
使い方: python3 -I daily_run.py OUT_DIR [hours=24]
判定（危険度・報道済みの除外・前日との差分）は、この出力を読んだ人（Claude）が行う。"""
import json, os, re, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
HOURS = sys.argv[2] if len(sys.argv) > 2 else "24"
os.makedirs(OUT, exist_ok=True)

def py(script, *args, log):
    return subprocess.Popen([sys.executable, "-I", os.path.join(HERE, script), *args],
                            stderr=open(os.path.join(OUT, log), "w"), stdout=subprocess.DEVNULL)

boards = [l.strip() for l in open(os.path.join(HERE, "boards_daily.txt")) if l.strip()]
chunks = [boards[i::3] for i in range(3)]
procs = [
    py("rt_search.py", os.path.join(HERE, "queries_daily.txt"), os.path.join(OUT, "yahoo.jsonl"), HOURS, log="yahoo.log"),
    py("misskey_search.py", os.path.join(HERE, "queries_bakusai.txt"), os.path.join(OUT, "misskey.jsonl"), HOURS, log="misskey.log"),
    py("nico_search.py", os.path.join(HERE, "queries_nico.txt"), os.path.join(OUT, "nico.jsonl"), HOURS, log="nico.log"),
]
for i, c in enumerate(chunks):
    bf = os.path.join(OUT, f"boards{i}.txt"); open(bf, "w").write("\n".join(c) + "\n")
    procs.append(py("fivech_search.py", bf, os.path.join(OUT, f"5ch{i}.jsonl"), HOURS, "25", log=f"5ch{i}.log"))
t0 = time.time()
for p in procs: p.wait()

def jl(name):
    p = os.path.join(OUT, name)
    return [json.loads(l) for l in open(p, encoding="utf-8")] if os.path.exists(p) else []

INTENT = re.compile(r"殺す|殺し|ころす|コロス|[◯○〇●]す|56す|56して|4ね|タヒ|ﾀﾋ|死ね|爆破|放火|燃やす|刺す|轢|皆殺し|道連れ|襲撃|やってやる|天誅")
ACT = re.compile(r"殺し?て?(やる|する|す|そう|しよう|したい|たい|しに)|殺すぞ|ころす|刺し?て?(やる|す|したい|しに)|爆破(する|して|しよう|したい|してやる)|燃やし?て?(やる|す)|放火(する|して)|轢(く|いて|き殺)|無差別|道連れ|襲撃(する|して)|56|ﾀﾋ|タヒ|[◯○〇●]す|4ね|巻き込|死刑になりたい|人を殺|予告")
FIRST = re.compile(r"俺|オレ|おれ|ワイ|わい|自分|僕|ボク|私|わたし|今から|これから|明日|今日|今夜|週末|決行|実行|もう限界|最後")
TGT = re.compile(r"学校|駅|会場|演説|職場|会社|市役所|役所|店|病院|イベント|ライブ|電車|モール|繁華街|交差点|渋谷|新宿|池袋|梅田|秋葉原|通り魔|誰でも|議員|首相|総理|知事|候補|空港")
TIME = re.compile(r"明日|今日|今夜|今晩|週末|来週|\d{1,2}月\d{1,2}日|\d{1,2}時|当日|決行")
NEWS = re.compile(r"容疑者|逮捕|報道によ|記事|asahi\.5ch|ソース|被告|判決")
FICT = re.compile(r"ゲーム|実況|配信|アニメ|漫画|映画|ドラマ|小説|キャラ|ボス|ガチャ|推し|ｗｗ|www|草|笑|ネタ|冗談|殺す気か|殺す気で|飯テロ|プロセス")

def score(t):
    return 2 * bool(INTENT.search(t)) + 2 * bool(TGT.search(t)) + 2 * bool(TIME.search(t)) + bool(FIRST.search(t)) \
        - 3 * bool(NEWS.search(t)) - 2 * bool(FICT.search(t))

cands, seen = [], set()
def add(src, time_jst, url, who, text, extra=None):
    k = text[:50]
    if k in seen: return
    seen.add(k)
    cands.append({"source": src, "time": time_jst, "url": url, "who": who, "text": text[:400], "score": score(text), **(extra or {})})

yahoo = jl("yahoo.jsonl")
for r in yahoo:
    t = r.get("text") or ""
    t = t.replace("\tSTART\t", "[").replace("\tEND\t", "]")
    if score(t) >= 4 and ACT.search(t): add("X", r["time_jst"], (r.get("url") or "").split("?")[0], "@" + (r.get("screenName") or ""), t)
fivech = [r for i in range(3) for r in jl(f"5ch{i}.jsonl")]
for r in fivech:
    t = r["text"]
    if ACT.search(t) and (FIRST.search(t) or TGT.search(t)) and not NEWS.search(t):
        add("5ch", r["time_jst"], r["url"], r["board"], t, {"thread": r["thread"]})
for r in jl("misskey.jsonl"): add("Misskey", r["time_jst"], r["url"], "@" + r["user"], r["text"])
for r in jl("nico.jsonl"):
    t = (r.get("title") or "") + " / " + re.sub(r"<[^>]+>", " ", r.get("description") or "")
    if ACT.search(t) and not FICT.search(t): add("ニコニコ", r["startTime"][:16].replace("T", " "), r["url"], "", t)
cands.sort(key=lambda c: -c["score"])

def last(logname, pat):
    p = os.path.join(OUT, logname)
    if not os.path.exists(p): return 0
    m = re.findall(pat, open(p, encoding="utf-8").read())
    return int(m[-1]) if m else 0
stats = {"hours": HOURS, "elapsed_sec": int(time.time() - t0),
         "x_posts": len(yahoo), "misskey_notes": len(jl("misskey.jsonl")), "nico_videos": len(jl("nico.jsonl")),
         "fivech_responses": sum(last(f"5ch{i}.log", r"24h内レス=(\d+)") for i in range(3)),
         "fivech_hits": len(fivech), "boards": len(boards), "candidates": len(cands)}
json.dump({"stats": stats, "candidates": cands[:120]}, open(os.path.join(OUT, "candidates.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(stats, ensure_ascii=False))
