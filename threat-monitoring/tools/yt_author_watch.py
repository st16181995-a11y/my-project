"""YouTube：指定したチャンネル（投稿者）のコメントを、書き込み先チャンネルの最近の動画と、皇室・育樹祭関連の新着動画から探す。
使い方: python3 -I yt_author_watch.py out.json AUTHOR_CHANNEL_ID [HOST_CHANNEL_ID,...] [days=21] [max_queries=6]
キーは環境変数 YOUTUBE_API_KEY。使用量の目安：検索6回×100＋動画数×1〜5単位。"""
import json, os, sys, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

K = os.environ.get("YOUTUBE_API_KEY", "")
QS = ["秋篠宮|紀子さま|紀子様|キーコ", "育樹祭|植樹祭|和歌山 秋篠宮|白浜 秋篠宮|田辺 秋篠宮", "悠仁さま|佳子さま|皇嗣", "天皇陛下|愛子さま|敬宮|皇室", "秋篠宮家 炎上|紀子さま 波紋|皇室 衝撃", "天皇ご一家|両陛下|雅子さま|美智子さま"]


def call(p, **q):
    r = urllib.request.Request("https://www.googleapis.com/youtube/v3/" + p + "?" + urllib.parse.urlencode(q), headers={"X-goog-api-key": K})
    return json.load(urllib.request.urlopen(r, timeout=25))


def main():
    out, author = sys.argv[1], sys.argv[2]
    hosts = [h for h in (sys.argv[3].split(",") if len(sys.argv) > 3 else []) if h]
    days = int(sys.argv[4]) if len(sys.argv) > 4 else 21
    qmax = int(sys.argv[5]) if len(sys.argv) > 5 else len(QS)
    if not K:
        json.dump({"error": "YOUTUBE_API_KEY なし"}, open(out, "w"), ensure_ascii=False); return
    after = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    vids = {}
    for h in hosts:
        tok = None
        for _ in range(4):
            q = dict(part="snippet", playlistId="UU" + h[2:], maxResults=50)
            if tok: q["pageToken"] = tok
            try: d = call("playlistItems", **q)
            except Exception: break
            for it in d.get("items", []):
                if it["snippet"]["publishedAt"] >= after:
                    vids[it["snippet"]["resourceId"]["videoId"]] = it["snippet"]["title"]
            tok = d.get("nextPageToken")
            if not tok: break
    for qq in QS[:qmax]:
        try:
            d = call("search", part="snippet", q=qq, type="video", order="date", maxResults=50, publishedAfter=after, regionCode="JP", relevanceLanguage="ja")
            for it in d.get("items", []): vids.setdefault(it["id"]["videoId"], it["snippet"]["title"])
        except Exception as e:
            print("ERR search", qq, e, file=sys.stderr)
    hits = {}
    for vid, title in vids.items():
        tok = None
        for _ in range(5):
            q = dict(part="snippet,replies", videoId=vid, maxResults=100, order="time", textFormat="plainText")
            if tok: q["pageToken"] = tok
            try: d = call("commentThreads", **q)
            except Exception: break
            for th in d.get("items", []):
                for c in [th["snippet"]["topLevelComment"]] + th.get("replies", {}).get("comments", []):
                    s = c["snippet"]
                    if s.get("authorChannelId", {}).get("value") == author:
                        ts = datetime.fromisoformat(s["publishedAt"].replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=9)))
                        u = f"https://www.youtube.com/watch?v={vid}&lc={c['id']}"
                        hits[u] = {"time": ts.strftime("%Y-%m-%d %H:%M"), "video": title, "url": u, "text": s.get("textOriginal", "")}
            tok = d.get("nextPageToken")
            if not tok: break
    try:
        ch = call("channels", part="snippet,statistics", id=author)["items"]
        status = "ok" if ch else "チャンネルが見つからない（削除・停止の可能性）"
    except Exception as e:
        status = f"チャンネル確認失敗: {e}"
    json.dump({"author": author, "status": status, "videos_scanned": len(vids), "hits": sorted(hits.values(), key=lambda h: h["time"])},
              open(out, "w"), ensure_ascii=False, indent=1)
    print(f"videos={len(vids)} hits={len(hits)} status={status}", file=sys.stderr)


if __name__ == "__main__":
    main()
