# Faz a Smart TV abrir automaticamente ao ligar o Windows, em tela cheia.
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1          -> inicia com o Windows
#   powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 -Shell   -> substitui o Explorer
#                                    (sem barra de tarefas/área de trabalho, só a TV)
param([switch]$Shell)

$appDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$electron = Join-Path $appDir 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { Write-Error "Rode 'npm install' em $appDir primeiro."; exit 1 }
$cmd = "`"$electron`" `"$appDir`""

if ($Shell) {
  Set-ItemProperty 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name Shell -Value $cmd
  Write-Host 'Pronto: faça logoff/login. O Windows vai abrir direto na Smart TV.'
  Write-Host 'Para desfazer: Remove-ItemProperty "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name Shell'
} else {
  Set-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name SmartTV -Value $cmd
  Write-Host 'Pronto: a Smart TV abre sozinha quando o Windows iniciar.'
}
