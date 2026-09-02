# ルーティンが発火しないときの復旧手順

## 前提: ルーティンは Mac の上で動いている

`Mercari relist 0000/0600/1800` / `Mercari hide sold 1100` / `Yahoo relist 1500` は
**Mac 上のブリッジワーカー**で動く (`environment_kind: "bridge"` /
`origin: "claude_code_cli"` / `tags: ["remote-control-sdk"]`)。
iOS や claude.ai/code から開くセッションは別環境 (`anthropic_cloud`) で、
Mac のブラウザにもメルカリのログイン状態にも触れない。

## クラウドのセッションからは代行も起動もできない (2026-09-02 に確認)

| 試したこと | 結果 |
| --- | --- |
| `list_triggers` | 空。ルーティンの定義は Mac ローカルにあり、**中身をクラウドから読めない** |
| `list_environments` | `anthropic_cloud` の「デフォルト」1 つだけ。**Mac のブリッジ環境は出てこない** → `create_session` で Mac 側にセッションを作れない |
| `ListAgents` → `SendMessage` | 到達可能なエージェント無し。`"Mercari relist 1800"` 宛は `No agent named ... is reachable` |
| クラウド側でのブラウザ実行 | ログイン状態が無く、アカウント操作は不可能 |

前回の対策 2「既存セッションへの resume をやめて毎回 `create_session` する」は、
**クラウド側からは実装も実行もできない**。Mac 側のスケジューラ設定を変える必要がある
(`scripts/find-claude-routines.sh` で定義の場所を特定するところから)。

## 発火したかどうかの見分けかた

セッション一覧で、その日の該当時刻に `environment_kind: "bridge"` の
**新しいセッションが立っているか**を見る。実績の作成時刻は次のとおり。

| ルーティン | 作成時刻 (JST) |
| --- | --- |
| Mercari relist 0000 | 00:07 頃 |
| Mercari relist 0600 | 06:08 頃 |
| Mercari hide sold 1100 | 11:01 頃 |
| Yahoo relist 1500 | 15:04 頃 |
| Mercari relist 1800 | 18:05 頃 |

10 分過ぎても新しいセッションが立たなければ、ワーカーが落ちている疑いが濃い。
`Yahoo relist 1500` のように**前日のセッションを resume する**日もあるため、
新規作成が無い場合は既存セッションの `updated_at` も併せて見る。

## 復旧

1. Mac のスリープを解除し、Claude Code (デスクトップ / CLI) を開く。
   ブリッジワーカーが再接続すれば、以降のルーティンは通常どおり発火する。
2. 発火時刻を過ぎてしまった分は、**Mac 側で手動で起動する**。
   クラウドのセッションからは代われない (上記のとおり)。
3. 再発防止として `bash scripts/mac-keep-awake.sh` を入れる
   (`scripts/README.md` 参照。フタを閉じる運用なら `sudo pmset -c disablesleep 1` も併用)。

## 記録: 2026-09-02

- 11:00 のルーティンは新セッションで発火 (11:01 JST 作成、12:50 JST まで稼働)。
- 15:00 の Yahoo は前日セッションを resume し、16:14 JST まで更新。
- **18:00 のルーティンは 18:12 JST 時点で新セッションが立たず**。
  16:14〜18:00 JST の間にワーカーが落ちたと見るのが自然で、
  「1 日約 2 回再起動」という `worker_epoch` からの推定とも一致する。
