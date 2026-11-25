param([switch]$Team,[switch]$NoBrowser)
$ErrorActionPreference='Stop'
$url='http://127.0.0.1:8845'
$running=$false
try{$r=Invoke-WebRequest -Uri ($url+'/api/health') -TimeoutSec 3 -UseBasicParsing;$running=(($r.Content|ConvertFrom-Json).app -eq 'NumuneTakip V2')}catch{}
$python=(Get-Command python -ErrorAction Stop).Source
if(-not $running){
 $cache=Join-Path $PSScriptRoot 'server/cache';New-Item -ItemType Directory -Force -Path $cache|Out-Null
 $script=Join-Path $PSScriptRoot 'server/server.py'
 Start-Process -FilePath $python -ArgumentList @('"'+$script+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $cache 'server.log') -RedirectStandardError (Join-Path $cache 'server-error.log')
 for($i=0;$i -lt 25;$i++){try{Invoke-WebRequest -Uri ($url+'/api/health') -TimeoutSec 1 -UseBasicParsing|Out-Null;break}catch{Start-Sleep -Milliseconds 300}}
}
if($Team){
 $wifi=Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and $_.NdisPhysicalMedium -in @(1,9) } |
  ForEach-Object { Get-NetIPConfiguration -InterfaceIndex $_.ifIndex } | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } | Select-Object -First 1
 if(-not $wifi){throw 'Ekip erisimi icin Wi-Fi baglantisi gerekiyor.'}
 $addr=$wifi.IPv4Address | Where-Object {$_.IPAddress -notlike '169.254.*'} | Select-Object -First 1
 $body=@{interface=($addr.IPAddress+'/'+$addr.PrefixLength)} | ConvertTo-Json
 $share=Invoke-RestMethod ($url+'/api/team-listener') -Method Post -ContentType 'application/json' -Body $body
 Write-Host ('Ekip adresi: '+$share.url)
 $rule='NumuneTakip-V2-WiFi-8845'
 if(-not (Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue)){
  $helper=Join-Path $PSScriptRoot 'WIFI-IZNI-V2.ps1'
  Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$helper+'"'),'-PythonPath',('"'+$python+'"'))
 }
}
if(-not $NoBrowser){Start-Process $url}
