# Instalação: do pendrive de teste ao dual boot com Windows

- **Fase 1 (teste):** imagem leve que dá boot direto na TV pelo pendrive. Nada é instalado.
- **Fase 2 (definitivo):** Ubuntu 24.04 LTS instalado ao lado do Windows, com o instalador da
  Smart TV por cima (drivers, Secure Boot e atualizações do Ubuntu).

---

## Fase 1: pendrive de teste (imagem leve, boot direto na TV)

Uma imagem própria da Smart TV (Debian 12 mínimo, sem área de trabalho, cerca de 1 a 1,5 GB).
Você grava no pendrive, dá boot e ela abre direto no launcher. **Nada é instalado no PC**
e o disco do Windows não é tocado.

1. **Baixe a imagem:** em [Releases](https://github.com/slipzin/finance-bot/releases), pegue o
   `smart-tv-live-amd64.iso` mais recente. Ela é gerada automaticamente pelo GitHub a cada
   atualização do código (workflow *Smart TV - imagem do pendrive*).
2. **Grave no pendrive** (4 GB ou mais) com o [balenaEtcher](https://etcher.balena.io) ou o
   [Rufus](https://rufus.ie). No Rufus, quando ele perguntar, escolha **modo DD**.
3. **Dê boot pelo pendrive:** reinicie e abra o menu de boot (F12, F11, F8 ou Esc, dependendo
   da placa-mãe). Se não aparecer, desative o *Secure Boot* na BIOS só para o teste.
4. A TV abre sozinha. Sem cabo de rede, vá em **Configurações** (bloco ⚙) → Wi-Fi.

### Guardar logins e apps entre um boot e outro (opcional)

Sem isso, a imagem começa "zerada" a cada boot (bom para testar, mas você precisa entrar nas
contas de novo). Para guardar:

- **Com Ventoy (mais fácil, funciona no Windows):** instale o [Ventoy](https://www.ventoy.net)
  no pendrive, copie o `.iso` para ele e crie um arquivo de persistência com rótulo
  `persistence` e um `persistence.conf` contendo `/ union`, seguindo o
  [plugin de persistência do Ventoy](https://www.ventoy.net/en/plugin_persistence.html).
- **Com Etcher/Rufus:** depois de gravar, crie no espaço livre do pendrive uma partição
  `ext4` com rótulo `persistence` e, dentro dela, um arquivo `persistence.conf` com `/ union`.

A imagem já liga com a opção `persistence`, então ela usa essa partição/arquivo se existir.

### Teclado e outros ajustes de boot

No menu do pendrive, aperte `Tab` (ou `e`) e adicione ao fim da linha, por exemplo,
`keyboard-layouts=br` (teclado ABNT2) ou `timezone=Europe/Lisbon`.

### Atualizar

Baixe a imagem mais nova e grave de novo (com Ventoy, basta trocar o arquivo `.iso`).

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
3. Depois de instalar, abra o Terminal e rode:

   ```bash
   sudo apt install -y git
   git clone -b claude/smart-tv-native-app-d4pzo8 https://github.com/slipzin/finance-bot.git
   cd finance-bot/smart-tv
   ./scripts/install-linux.sh --kiosk
   sudo reboot
   ```

   Para atualizar depois: `cd ~/finance-bot && git pull && cd smart-tv && ./scripts/install-linux.sh --kiosk`.

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
- **Pendrive não liga direto na TV:** no menu do pendrive escolha a primeira opção; se a tela
  ficar preta, tente a opção *failsafe* e me mande uma foto da tela.
- **Windows sumiu do menu de boot:** rode `sudo update-grub` e depois `./scripts/install-linux.sh --kiosk`.
