"""YouTube Data API v3 で、検索語ごとに直近7日の動画を探し、その動画の直近N時間のコメントを集める。
使い方: python3 -I yt_comments.py queries.txt out.jsonl [hours=24]
キーは環境変数 YOUTUBE_API_KEY から読む（チャットやファイルには書かない）。
使用量の目安: 検索1回=100単位、コメント取得1回=1単位（無料枠 1日10,000単位）。"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
API = "https://www.googleapis.com/youtube/v3/"
KEY = os.environ.get("YOUTUBE_API_KEY", "")
MAX_VIDEOS = 60


def call(path, **params):
    req = urllib.request.Request(API + path + "?" + urllib.parse.urlencode(params), headers={"X-goog-api-key": KEY})
    try:
        return json.load(urllib.request.urlopen(req, timeout=25))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        if e.code == 401:
            raise RuntimeError("401: Authorization ヘッダーが付いている可能性（Network secrets の Bearer 登録を削除）")
        raise RuntimeError(f"{e.code}: {body[:200]}")


def main():
    if not KEY:
        print("YOUTUBE_API_KEY がありません。スキップします。", file=sys.stderr)
        open(sys.argv[2], "w").close()
        return
    qfile, out = sys.argv[1], sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    after = (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    videos = {}
    for q in [l.strip() for l in open(qfile, encoding="utf-8") if l.strip() and not l.startswith("#")]:
        try:
            d = call("search", part="snippet", q=q, type="video", order="date", maxResults=15,
                     publishedAfter=after, regionCode="JP", relevanceLanguage="ja")
        except Exception as e:
            print(f"ERR search {q}: {e}", file=sys.stderr)
            if "401" in str(e) or "403" in str(e): break
            continue
        for it in d.get("items", []):
            vid = it["id"]["videoId"]
            videos.setdefault(vid, {"title": it["snippet"]["title"], "channel": it["snippet"]["channelTitle"], "queries": []})["queries"].append(q)
        print(f"{q}\t動画{len(d.get('items', []))}", file=sys.stderr)
    rows = []
    for vid, v in list(videos.items())[:MAX_VIDEOS]:
        try:
            d = call("commentThreads", part="snippet,replies", videoId=vid, order="time", maxResults=100, textFormat="plainText")
        except Exception as e:
            print(f"skip {vid}: {str(e)[:80]}", file=sys.stderr)  # コメント無効の動画など
            continue
        for th in d.get("items", []):
            cs = [th["snippet"]["topLevelComment"]] + th.get("replies", {}).get("comments", [])
            for c in cs:
                s = c["snippet"]
                ts = datetime.fromisoformat(s["publishedAt"].replace("Z", "+00:00"))
                if ts < cutoff: continue
                rows.append({"time_jst": ts.astimezone(JST).strftime("%Y-%m-%d %H:%M"),
                             "url": f"https://www.youtube.com/watch?v={vid}&lc={c['id']}",
                             "author": s.get("authorDisplayName", ""), "text": s.get("textDisplay", ""),
                             "video": v["title"], "channel": v["channel"], "queries": v["queries"]})
        time.sleep(0.2)
    with open(out, "w", encoding="utf-8") as f:
        for r in sorted(rows, key=lambda r: r["time_jst"], reverse=True):
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"videos={len(videos)} comments={len(rows)}", file=sys.stderr)


if __name__ == "__main__":
    main()
