#!/usr/bin/env bash
# Faz o PC ligar direto na Smart TV (sem área de trabalho, sem navegador).
#   ./scripts/install-linux.sh            -> abre automaticamente ao entrar na sessão gráfica
#   ./scripts/install-linux.sh --kiosk    -> modo TV de verdade: liga direto no launcher via
#                                            compositor "cage", sem desktop (requer sudo)
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(id -un)"
ELECTRON="$APP_DIR/node_modules/.bin/electron"

if [ ! -x "$ELECTRON" ]; then
  echo "Rode 'npm install' em $APP_DIR primeiro." >&2
  exit 1
fi

# AirPlay (espelhar iPhone/iPad/Mac): receptor UxPlay + Bonjour (avahi) + codecs de vídeo.
if command -v apt-get >/dev/null; then
  sudo apt-get install -y uxplay avahi-daemon gstreamer1.0-plugins-bad gstreamer1.0-libav gstreamer1.0-vaapi pulseaudio-utils
  sudo systemctl enable --now avahi-daemon
  if command -v ufw >/dev/null && sudo ufw status | grep -q active; then
    # Portas fixas do UxPlay (-p) e do controle remoto do iPhone.
    sudo ufw allow 7000:7001/tcp && sudo ufw allow 7100/tcp && sudo ufw allow 6000:6001/udp && sudo ufw allow 7011/udp
    sudo ufw allow 5353/udp && sudo ufw allow 8765/tcp
  fi
fi

if [ "${1:-}" != "--kiosk" ]; then
  mkdir -p "$HOME/.config/autostart"
  cat > "$HOME/.config/autostart/smart-tv.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Smart TV
Exec=$ELECTRON $APP_DIR
X-GNOME-Autostart-enabled=true
DESK
  echo "Pronto: a Smart TV abre sozinha quando você entrar na sessão."
  exit 0
fi

sudo apt-get install -y cage
sudo tee /etc/systemd/system/smart-tv.service >/dev/null <<UNIT
[Unit]
Description=Smart TV (kiosk)
After=systemd-user-sessions.service plymouth-quit-wait.service
Conflicts=getty@tty1.service

[Service]
User=$USER_NAME
PAMName=login
TTYPath=/dev/tty1
StandardInput=tty
Environment=XDG_SESSION_TYPE=wayland
ExecStart=/usr/bin/cage -s -- $ELECTRON $APP_DIR --ozone-platform=wayland
Restart=always
RestartSec=2

[Install]
WantedBy=graphical.target
UNIT
sudo systemctl daemon-reload
sudo systemctl disable display-manager.service 2>/dev/null || true
sudo systemctl enable smart-tv.service
echo "Pronto: reinicie o PC. Ele vai ligar direto na Smart TV."
echo "Para desfazer: sudo systemctl disable smart-tv && sudo systemctl enable gdm (ou sddm/lightdm)."
