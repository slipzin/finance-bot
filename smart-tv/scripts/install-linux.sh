#!/usr/bin/env bash
# Instala a Smart TV em Ubuntu 24.04+ / Debian 12+ (no pendrive de teste ou no dual boot).
#
#   ./scripts/install-linux.sh            Modo teste: abre a TV ao entrar na área de trabalho
#   ./scripts/install-linux.sh --kiosk    Modo TV: liga direto na Smart TV, sem área de trabalho
#
# Pode rodar de novo a qualquer momento para atualizar (ex.: depois de um "git pull").
set -euo pipefail

MODE="${1:-}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/smart-tv
USER_NAME="$(id -un)"
USER_HOME="$HOME"

if [ "$(id -u)" -eq 0 ]; then
  echo "Rode como seu usuário normal (o script pede a senha do sudo quando precisa)." >&2
  exit 1
fi
if ! command -v apt-get >/dev/null; then
  echo "Este instalador é para Ubuntu/Debian." >&2
  exit 1
fi

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }

step "Pacotes do sistema"
sudo apt-get update
sudo apt-get install -y \
  curl ca-certificates rsync \
  xserver-xorg xinit x11-xserver-utils matchbox-window-manager xdotool \
  pipewire pipewire-pulse pipewire-alsa wireplumber pulseaudio-utils bluez \
  flatpak \
  uxplay avahi-daemon gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
  gstreamer1.0-libav gstreamer1.0-vaapi gstreamer1.0-gl \
  fonts-noto-core fonts-noto-color-emoji
sudo systemctl enable --now avahi-daemon bluetooth || true

step "Node.js 22 (o Electron atual não funciona com o Node 18 do Ubuntu)"
if ! command -v node >/dev/null || ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

step "Copiando o app para $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER_NAME:" "$APP_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  rsync -a --delete --exclude node_modules --exclude dist --exclude .git "$SRC_DIR/" "$APP_DIR/"
fi
(cd "$APP_DIR" && npm install --no-audit --no-fund)
# O sandbox do Chromium precisa disso no Ubuntu 24.04 (senão o app não abre).
SANDBOX="$APP_DIR/node_modules/electron/dist/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  sudo chown root:root "$SANDBOX"
  sudo chmod 4755 "$SANDBOX"
fi

step "Loja de apps nativos (Flathub)"
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

step "Spotify Connect (librespot)"
if ! command -v librespot >/dev/null; then
  # Pacote do projeto raspotify (librespot empacotado para Debian/Ubuntu, amd64/arm).
  curl -fsSL https://dtcooper.github.io/raspotify/key.asc | sudo tee /usr/share/keyrings/raspotify_key.asc >/dev/null
  echo 'deb [signed-by=/usr/share/keyrings/raspotify_key.asc] https://dtcooper.github.io/raspotify raspotify main' \
    | sudo tee /etc/apt/sources.list.d/raspotify.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y raspotify || echo "Aviso: não foi possível instalar o Spotify Connect."
fi
# A TV roda o librespot ela mesma (no áudio do usuário); o serviço do sistema não é usado.
sudo systemctl disable --now raspotify 2>/dev/null || true

step "Firewall"
if command -v ufw >/dev/null && sudo ufw status | grep -q 'Status: active'; then
  sudo ufw allow 7000:7001/tcp   # AirPlay (UxPlay -p)
  sudo ufw allow 7100/tcp
  sudo ufw allow 6000:6001/udp
  sudo ufw allow 7011/udp
  sudo ufw allow 5353/udp        # Bonjour (TV aparece no iPhone)
  sudo ufw allow 1900/udp        # DIAL/SSDP (YouTube no botão de transmitir)
  sudo ufw allow 56790/tcp
  sudo ufw allow 8765/tcp        # controle remoto do iPhone
  sudo ufw allow 5353/tcp
fi

step "Botão 'Reiniciar no Windows'"
if [ -f /etc/default/grub ]; then
  sudo sed -i 's/^GRUB_DEFAULT=.*/GRUB_DEFAULT=saved/' /etc/default/grub
  grep -q '^GRUB_DISABLE_OS_PROBER=' /etc/default/grub \
    && sudo sed -i 's/^GRUB_DISABLE_OS_PROBER=.*/GRUB_DISABLE_OS_PROBER=false/' /etc/default/grub \
    || echo 'GRUB_DISABLE_OS_PROBER=false' | sudo tee -a /etc/default/grub >/dev/null
  sudo apt-get install -y os-prober
  sudo update-grub
  if grep -qE "^menuentry '[^']*Windows" /boot/grub/grub.cfg; then
    sudo install -o root -g root -m 0755 "$APP_DIR/scripts/reboot-windows.sh" /usr/local/sbin/smart-tv-reboot-windows
    echo "$USER_NAME ALL=(root) NOPASSWD: /usr/local/sbin/smart-tv-reboot-windows" \
      | sudo tee /etc/sudoers.d/smart-tv >/dev/null
    sudo chmod 0440 /etc/sudoers.d/smart-tv
    echo "Windows encontrado: o botão 'Windows' vai aparecer no menu de energia."
  else
    echo "Windows não encontrado no GRUB (normal se ainda não fez o dual boot)."
  fi
fi

ELECTRON="$APP_DIR/node_modules/.bin/electron"

if [ "$MODE" != "--kiosk" ]; then
  step "Modo teste: abrir ao entrar na área de trabalho"
  mkdir -p "$USER_HOME/.config/autostart"
  cat > "$USER_HOME/.config/autostart/smart-tv.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Smart TV
Exec=$ELECTRON $APP_DIR
X-GNOME-Autostart-enabled=true
DESK
  echo
  echo "Pronto! Para abrir agora: $ELECTRON $APP_DIR"
  echo "Quando estiver estável, rode de novo com --kiosk para ligar direto na TV."
  exit 0
fi

step "Modo TV (kiosk): login automático direto na Smart TV"
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
sudo tee /etc/systemd/system/getty@tty1.service.d/autologin.conf >/dev/null <<UNIT
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USER_NAME --noclear %I \$TERM
UNIT
install -m 0755 "$APP_DIR/scripts/xinitrc" "$USER_HOME/.xinitrc"
touch "$USER_HOME/.bash_profile"
sed -i '/smart-tv/d' "$USER_HOME/.bash_profile"
cat "$APP_DIR/scripts/bash_profile" >> "$USER_HOME/.bash_profile"
rm -f "$USER_HOME/.config/autostart/smart-tv.desktop"
sudo systemctl set-default multi-user.target
sudo systemctl disable display-manager.service 2>/dev/null || true
sudo systemctl daemon-reload

echo
echo "Pronto! Reinicie o PC: ele vai ligar direto na Smart TV."
echo "Desfazer: sudo systemctl set-default graphical.target && sudo rm /etc/systemd/system/getty@tty1.service.d/autologin.conf"
