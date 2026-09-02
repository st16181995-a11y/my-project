#!/usr/bin/env bash
#
# 対策2の準備: Mac ローカルに保存されているルーティン定義の場所を特定する。
#
# クラウドの list_triggers は空を返すため、ルーティンの定義は Mac 側に
# ローカル保存されている。「毎回新しいセッションで起動する」に変えるには
# その定義ファイルを特定する必要がある。
#
# このスクリプトは読み取り専用。設定の変更は一切行わない。
#
# 使い方:  bash scripts/find-claude-routines.sh
#          bash scripts/find-claude-routines.sh > /tmp/routines.txt   # 結果を渡す用

set -uo pipefail

hr() { printf '\n=== %s ===\n' "$1"; }

hr "0. 環境"
uname -a
echo "claude: $(command -v claude || echo '(PATH に無し)')"
command -v claude >/dev/null && claude --version 2>/dev/null

hr "1. Claude 関連ディレクトリ"
for d in \
  "$HOME/.claude" \
  "$HOME/.config/claude" \
  "$HOME/Library/Application Support/Claude" \
  "$HOME/Library/Application Support/Cowork" \
  "$HOME/Library/Application Support/claude-code"
do
  if [ -d "$d" ]; then
    printf -- '--- %s\n' "$d"
    ls -la "$d" 2>/dev/null | head -40
  fi
done

hr "2. routine / schedule / trigger / task を名前に含むファイル"
find "$HOME/.claude" "$HOME/Library/Application Support" \
     -maxdepth 5 -type f \
     \( -iname '*routine*' -o -iname '*schedul*' -o -iname '*trigger*' \
        -o -iname '*task*' -o -iname '*cron*' \) 2>/dev/null \
  | grep -iE 'claude|cowork' | head -40

hr "3. LaunchAgents / LaunchDaemons"
ls -la "$HOME/Library/LaunchAgents" 2>/dev/null \
  | grep -iE 'claude|cowork|mercari|yahoo|relist' || echo "(該当なし)"
launchctl list 2>/dev/null \
  | grep -iE 'claude|cowork|mercari|relist' || echo "(launchctl に該当なし)"

hr "4. crontab"
crontab -l 2>/dev/null || echo "(crontab なし)"

hr "5. ルーティン名を含む設定ファイル"
grep -rilE 'relist|hide sold|Yahoo relist|Mercari relist' \
     "$HOME/.claude" "$HOME/Library/Application Support/Claude" 2>/dev/null \
  | head -20

hr "6. settings.json 系"
for f in "$HOME/.claude/settings.json" "$HOME/.claude/settings.local.json"; do
  [ -f "$f" ] && { printf -- '--- %s\n' "$f"; cat "$f"; }
done

hr "完了"
cat <<'NOTE_EOF'
上の出力をそのままセッションに貼ってください。
定義の場所と形式が分かれば「毎回新しいセッションで起動する」への
変更を具体的に作成できます。

見るべきポイント:
  - ルーティンが既存セッションIDを指して resume しているか
    (= persistent session 方式。今回の孤児化の原因)
  - それとも毎回 create_session しているか
    (= 新セッション方式。こちらが目標の形)
NOTE_EOF
