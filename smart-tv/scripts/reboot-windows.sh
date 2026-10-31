#!/bin/sh
# Reinicia uma única vez no Windows (o próximo boot volta para a Smart TV).
# Instalado como /usr/local/sbin/smart-tv-reboot-windows pelo install-linux.sh.
set -e
entry=$(grep -E "^menuentry '[^']*Windows" /boot/grub/grub.cfg | head -n 1 | cut -d"'" -f2)
if [ -z "$entry" ]; then
  echo "Entrada do Windows não encontrada no GRUB." >&2
  exit 1
fi
grub-reboot "$entry"
systemctl reboot
