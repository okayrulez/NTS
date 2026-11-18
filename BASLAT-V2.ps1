$ErrorActionPreference='Stop'
$url='http://127.0.0.1:8845'
$running=$false
try{$r=Invoke-WebRequest -Uri ($url+'/api/health') -TimeoutSec 3 -UseBasicParsing;$running=(($r.Content|ConvertFrom-Json).app -eq 'NumuneTakip V2')}catch{}
if(-not $running){
 $python=(Get-Command python -ErrorAction Stop).Source
 $cache=Join-Path $PSScriptRoot 'server/cache';New-Item -ItemType Directory -Force -Path $cache|Out-Null
 $script=Join-Path $PSScriptRoot 'server/server.py'
 Start-Process -FilePath $python -ArgumentList @('"'+$script+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $cache 'server.log') -RedirectStandardError (Join-Path $cache 'server-error.log')
 for($i=0;$i -lt 25;$i++){try{Invoke-WebRequest -Uri ($url+'/api/health') -TimeoutSec 1 -UseBasicParsing|Out-Null;break}catch{Start-Sleep -Milliseconds 300}}
}
Start-Process $url
