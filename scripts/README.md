# ルーティンセッション切断の調査と対策

## 症状

ルーティンのセッション (Mercari relist 0000/0600/1800, Mercari hide sold 1100,
Yahoo relist 1500) が突然切断される。

## 原因

ルーティンのセッションはクラウドではなく **Mac 上のブリッジワーカー**で動いている
(`environment_kind: "bridge"` / `origin: "claude_code_cli"` /
`tags: ["remote-control-sdk"]`)。Mac 側のワーカーが落ちると開きっぱなしの
セッションが孤児になり、再接続時に `computer_unreachable` になる。

### 根拠

- 16 セッションの `last_init_error` が
  `error_kind: "computer_unreachable"` / `recoverable: "true"`
- 発生時刻が **2026-08-31 22:21〜22:27 JST の 5 分間に集中**
  (個別の不具合ではなく一斉イベント)。その約 10 分前の 22:12 JST に
  全セッションが一斉に `updated_at` を更新されている
- `worker_epoch` (セッション作成後のワーカー再起動回数) から
  **Mac 側ワーカーが 1 日約 2 回再起動**していることが読める

  | セッション作成 | epoch | 経過 | 換算 |
  |---|---|---|---|
  | 8/26 15:07 | 10 | 5 日 | 2 回/日 |
  | 8/28 15:07 | 6 | 3 日 | 2 回/日 |
  | 8/30 02:01 | 3 | 1.5 日 | 2 回/日 |
  | 8/31 02:01 | 1 | 0.5 日 | 2 回/日 |

- レート制限は**無関係**。全セッション `status: "allowed"` /
  `isUsingOverage: false`

### 除外した仮説

- レート制限 — 上記のとおり全て `allowed`
- クラウド側セッションの `disconnected` — アイドル時のコンテナ回収で正常動作
- リポジトリ内の設定ミス — routine/cron/schedule 関連ファイルは存在しない

## 対策

### 1. Mac をスリープさせない → `mac-keep-awake.sh`

```sh
bash scripts/mac-keep-awake.sh
```

`caffeinate -dims` を LaunchAgent として常駐させ、ログイン時の自動起動と
プロセス落ち時の自動復帰を設定する。解除は `--uninstall`。

フタを閉じた場合のスリープは caffeinate では防げないため、
スクリプトの出力に従って `sudo pmset -c disablesleep 1` を併用する
(排熱に注意)。

### 2. 毎回新しいセッションで起動する → `find-claude-routines.sh`

クラウドの `list_triggers` は空を返すため、ルーティンの定義は Mac 側に
ローカル保存されている。定義の場所と形式が不明なので、まず読み取り専用の
調査スクリプトで特定する。

```sh
bash scripts/find-claude-routines.sh
```

出力をセッションに貼れば、既存セッションへの resume をやめて毎回
`create_session` する形への変更を作成できる。
