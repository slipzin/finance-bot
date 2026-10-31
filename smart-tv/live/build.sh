#!/usr/bin/env bash
# Gera a imagem do pendrive da Smart TV: Debian 12 mínimo, sem área de trabalho,
# que liga direto no launcher. Resultado: dist/smart-tv-live-amd64.iso
#
# Uso: em Debian 12 (ou no container debian:bookworm --privileged), como root:
#   apt-get install -y live-build git rsync curl ca-certificates   (+ Node.js 22.12 ou mais novo)
#   ./live/build.sh
# O GitHub Actions (.github/workflows/smart-tv-live.yml) faz isso sozinho a cada mudança.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$(cd "$HERE/.." && pwd)"
WORK="${WORK:-/tmp/smart-tv-live}"
OUT="${OUT:-$APP/dist}"

[ "$(id -u)" -eq 0 ] || { echo "Rode como root." >&2; exit 1; }
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' \
  || { echo "Precisa do Node.js 22.12 ou mais novo (atual: $(node -v))." >&2; exit 1; }
rm -rf "$WORK"
mkdir -p "$WORK" "$OUT"
cd "$WORK"

lb config \
  --distribution bookworm \
  --architectures amd64 \
  --archive-areas "main contrib non-free non-free-firmware" \
  --binary-images iso-hybrid \
  --debian-installer none \
  --apt-recommends false \
  --memtest none \
  --iso-volume SMART_TV \
  --iso-application "Smart TV" \
  --bootappend-live "boot=live components username=tv hostname=smart-tv locales=pt_BR.UTF-8 timezone=America/Sao_Paulo persistence"

# Pacotes: só o necessário para a TV (sem área de trabalho).
cp "$HERE/packages.list" config/package-lists/smart-tv.list.chroot

# App já com o Electron (castLabs/Widevine) baixado.
STAGE=config/includes.chroot/opt/smart-tv
mkdir -p "$STAGE"
rsync -a --exclude node_modules --exclude dist --exclude .git --exclude test --exclude live --exclude docs \
  "$APP/" "$STAGE/"
node -e '
  const fs = require("fs"); const f = process.argv[1]; const p = JSON.parse(fs.readFileSync(f));
  p.dependencies = { electron: p.devDependencies.electron }; delete p.devDependencies; delete p.build;
  fs.writeFileSync(f, JSON.stringify(p, null, 2));' "$WORK/$STAGE/package.json"
(cd "$STAGE" && npm install --omit=dev --no-audit --no-fund --foreground-scripts && rm -f package-lock.json)
# O npm às vezes não roda o download do binário em dependências do GitHub: força e confere.
if [ ! -x "$STAGE/node_modules/electron/dist/electron" ]; then
  (cd "$STAGE/node_modules/electron" && node install.js)
fi
[ -x "$STAGE/node_modules/electron/dist/electron" ] || { echo "Electron não foi baixado." >&2; exit 1; }
ls -la "$STAGE/node_modules/electron/dist" | head

# Usuário "tv" (criado pelo live-config no boot) entra sozinho e abre a TV.
mkdir -p config/includes.chroot/etc/skel config/includes.chroot/etc/systemd/system/getty@tty1.service.d
install -m 0755 "$APP/scripts/xinitrc" config/includes.chroot/etc/skel/.xinitrc
cp "$APP/scripts/bash_profile" config/includes.chroot/etc/skel/.bash_profile
cat > config/includes.chroot/etc/systemd/system/getty@tty1.service.d/autologin.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin tv --noclear %I $TERM
UNIT

# Spotify Connect: pacote do librespot (raspotify), se disponível.
mkdir -p config/packages.chroot
RASPOTIFY_URL="$(curl -fsSL https://api.github.com/repos/dtcooper/raspotify/releases/latest \
  | grep -o 'https://[^"]*_amd64\.deb' | head -n 1 || true)"
if [ -n "$RASPOTIFY_URL" ]; then
  curl -fsSL -o config/packages.chroot/raspotify_amd64.deb "$RASPOTIFY_URL"
else
  echo "Aviso: raspotify não encontrado, imagem sem Spotify Connect."
fi

cp "$HERE/smart-tv.hook.chroot" config/hooks/normal/9000-smart-tv.hook.chroot
chmod +x config/hooks/normal/9000-smart-tv.hook.chroot

lb build

mv -f "$WORK"/live-image-amd64.hybrid.iso "$OUT/smart-tv-live-amd64.iso"
ls -lh "$OUT/smart-tv-live-amd64.iso"
