param([Parameter(Mandatory=$true)][string]$PythonPath)
$ErrorActionPreference='Stop'
$name='NumuneTakip-V2-WiFi-8845'
if(-not (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue)){
 New-NetFirewallRule -Name $name -DisplayName 'NumuneTakip V2 - Wi-Fi ekip erisimi' -Action Allow -Direction Inbound -Protocol TCP -LocalPort 8845 -InterfaceType Wireless -RemoteAddress LocalSubnet -Program $PythonPath | Out-Null
}
