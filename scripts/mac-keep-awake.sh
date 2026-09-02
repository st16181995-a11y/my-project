#!/usr/bin/env bash
#
# 対策1: Mac をスリープさせず、Claude Code のブリッジ接続を維持する。
#
# ルーティンのセッションは Mac 上のブリッジワーカーで動いているため、
# Mac がスリープするとセッションが孤児になり、再接続時に
# computer_unreachable になる。caffeinate を LaunchAgent として常駐させ、
# ログイン時に自動起動・落ちても自動復帰させる。
#
# 使い方:  bash scripts/mac-keep-awake.sh
# 解除:    bash scripts/mac-keep-awake.sh --uninstall

set -euo pipefail

LABEL="local.claude.keepawake"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
DOMAIN="gui/$(id -u)"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "エラー: このスクリプトは macOS 専用です (検出: $(uname -s))" >&2
  exit 1
fi

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST"
  echo "解除しました: ${LABEL}"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents"

# -d ディスプレイスリープ抑止 / -i システムのアイドルスリープ抑止
# -m ディスクのアイドルスリープ抑止 / -s システムスリープ抑止(電源接続時)
# ※ 画面は消えてよいなら -dims から d を外して -ims にする
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-dims</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/${LABEL}.err</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"

echo "インストール完了: $PLIST"
echo
if pgrep -x caffeinate >/dev/null 2>&1; then
  echo "caffeinate 稼働中 (pid: $(pgrep -x caffeinate | tr '\n' ' '))"
else
  echo "警告: caffeinate プロセスが見つかりません。/tmp/${LABEL}.err を確認してください" >&2
fi

echo
echo "現在の電源設定:"
pmset -g | grep -Ei 'sleep|disablesleep' || true

cat <<'NOTE_EOF'

--------------------------------------------------------------------
補足: フタを閉じるとスリープする件について

caffeinate はフタを閉じた場合のスリープ(clamshell sleep)は防げません。
切断が毎晩22時台に集中していたのはフタ閉じの可能性が高いため、
フタを閉じたまま動かしたい場合は追加で以下が必要です:

    sudo pmset -c disablesleep 1     # 有効化(電源接続時)
    sudo pmset -c disablesleep 0     # 元に戻す

注意: これを有効にしてカバンに入れると排熱できず高温になります。
電源に挿して開けた場所に置いておく運用の時だけ使ってください。

バッテリー駆動時もスリープさせたくない場合はさらに:

    sudo pmset -b disablesleep 1     # バッテリー消費が激しくなります
--------------------------------------------------------------------
NOTE_EOF
