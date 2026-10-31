# Instalação: do pendrive de teste ao dual boot com Windows

Sistema base recomendado: **Ubuntu 24.04 LTS** (Desktop, "instalação mínima").
Ele já vem com drivers de vídeo/Wi-Fi e Secure Boot funcionando. O instalador da Smart TV
coloca por cima só o necessário e, no modo TV, desliga a área de trabalho.

---

## Fase 1: testar no pendrive

Você precisa de **dois pendrives**: um de 8 GB para o instalador do Ubuntu e outro de
**32 GB ou mais (de preferência USB 3)** onde o sistema de teste vai ficar instalado.
Uma instalação completa no pendrive é muito mais estável que um "live USB com persistência".

1. Baixe o Ubuntu 24.04 Desktop em ubuntu.com e grave no pendrive de 8 GB com o
   [balenaEtcher](https://etcher.balena.io) ou o Rufus.
2. Conecte **os dois pendrives**, reinicie o PC e abra o menu de boot
   (F12, F11, F8 ou Esc, dependendo da placa-mãe). Escolha o pendrive do instalador.
3. No instalador: **Instalação interativa → Instalação padrão (mínima)**.
4. Em "Tipo de instalação", escolha **Instalação manual** e selecione **o pendrive de 32 GB**
   (confira pelo tamanho!). Crie uma partição `ext4` montada em `/` e, se o PC for UEFI,
   uma partição `EFI` de 512 MB **no próprio pendrive**.
   Em "Dispositivo para o carregador de inicialização", escolha **o pendrive de 32 GB**,
   assim o disco do Windows não é tocado.
5. Termine a instalação, remova o pendrive do instalador e dê boot pelo pendrive de 32 GB.
6. Abra o Terminal e instale a Smart TV:

   ```bash
   sudo apt install -y git
   git clone -b claude/smart-tv-native-app-d4pzo8 https://github.com/slipzin/finance-bot.git
   cd finance-bot/smart-tv
   ./scripts/install-linux.sh          # modo teste: abre ao entrar na área de trabalho
   ```

7. Quando tudo estiver bom, ative o modo TV (liga direto na TV, sem desktop):

   ```bash
   ./scripts/install-linux.sh --kiosk
   sudo reboot
   ```

Para atualizar depois: `cd finance-bot && git pull && cd smart-tv && ./scripts/install-linux.sh --kiosk`.

> Se o menu de boot do pendrive mostrar o **Windows** (o instalador detecta o disco interno),
> o botão **Windows** já aparece no menu de energia da TV, mesmo no teste.

---

## Fase 2: instalação definitiva com dual boot

### Antes de começar (no Windows)

1. **Backup** dos arquivos importantes.
2. **BitLocker**: se estiver ativo, anote a chave de recuperação
   (Configurações → Privacidade e segurança → Criptografia do dispositivo) ou desative.
3. **Desative a Inicialização Rápida**: Painel de Controle → Opções de Energia →
   "Escolher a função dos botões de energia" → desmarque "Ligar inicialização rápida".
4. **Libere espaço**: Gerenciamento de Disco → clique com o botão direito em `C:` →
   **Diminuir volume** → pelo menos **60 GB** (os apps nativos, como a Steam, ocupam bastante).
   Deixe como "Não alocado".

### Instalação

1. Dê boot pelo pendrive do instalador do Ubuntu (mesmo do teste).
2. Escolha **Instalar Ubuntu ao lado do Windows Boot Manager**. O instalador usa o espaço
   não alocado e mantém o Windows intacto.
   (Se preferir controle total: "Instalação manual" → use o espaço livre para uma partição
   `ext4` em `/` e reaproveite a partição EFI existente, **sem formatá-la**.)
3. Depois de instalar, rode os mesmos comandos do passo 6 da Fase 1, já com `--kiosk`.

### Como fica

- Ao ligar, o PC entra direto na **Smart TV** (o menu do GRUB aparece por alguns segundos
  e permite escolher o Windows).
- No launcher: **↑** na primeira fileira → **Windows** reinicia uma única vez no Windows;
  ao reiniciar de novo, volta para a TV.
- Para voltar ao Linux a partir do Windows: basta reiniciar.
- O Secure Boot pode continuar ligado (o Ubuntu é assinado).

### Se algo der errado

- **Tela preta ao ligar no modo TV:** `Ctrl+Alt+F2`, faça login e rode
  `cat ~/.local/share/xorg/Xorg.0.log | tail` para ver o erro; para voltar à área de trabalho:
  `sudo systemctl set-default graphical.target && sudo rm /etc/systemd/system/getty@tty1.service.d/autologin.conf && sudo reboot`.
- **"Sair" no menu da TV** vai para o terminal; `rm /tmp/smart-tv-stop && startx` volta para a TV
  (ou simplesmente reinicie).
- **Windows sumiu do menu de boot:** rode `sudo update-grub` e depois `./scripts/install-linux.sh --kiosk`.
