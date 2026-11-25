param([ValidateSet('Snapshot','Photos')][string]$Mode='Snapshot',[string]$CacheDir)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'tracking-since.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$configPath=$env:NUMUNE_ERP_CONFIG
if(-not $configPath){throw 'NUMUNE_ERP_CONFIG is required.'}
$cfg=@{}
Get-Content -LiteralPath $configPath | ForEach-Object {if($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$'){$cfg[$matches[1]]=$matches[2].Trim().Trim('"').Trim("'")}}
Add-Type -AssemblyName System.Data
$b=[System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$b['Data Source']=$cfg['ERP_DB_SERVER']+','+$cfg['ERP_DB_PORT'];$b['Initial Catalog']=$cfg['ERP_DB_DATABASE'];$b['User ID']=$cfg['ERP_DB_USER'];$b['Password']=$cfg['ERP_DB_PASSWORD'];$b['Encrypt']=[bool]::Parse($cfg['ERP_DB_ENCRYPT']);$b['TrustServerCertificate']=[bool]::Parse($cfg['ERP_DB_TRUST_CERT']);$b['Connect Timeout']=8
$conn=[System.Data.SqlClient.SqlConnection]::new($b.ConnectionString)
try{
 $phase='connect';$conn.Open();$phase='query';$cmd=$conn.CreateCommand();$cmd.CommandTimeout=60
 if($Mode -eq 'Snapshot'){
  $since=Read-TrackingSince
  $cutoff=$cmd.Parameters.Add('@since',[System.Data.SqlDbType]::DateTime2)
  $cutoff.Value=$since.ToOffset([TimeSpan]::FromHours(3)).DateTime
  $cutoff.Scale=7
  $parts=@('period-scope.sql','matches.sql','serials.sql','movements.sql','brands.sql','routes.sql','vouchers.sql')
  $cmd.CommandText=($parts | ForEach-Object {Get-Content -LiteralPath (Join-Path $PSScriptRoot $_) -Raw}) -join [Environment]::NewLine
  $sets=[Collections.Generic.List[object]]::new()
  $reader=$cmd.ExecuteReader()
  do {
   $rows=[Collections.Generic.List[object]]::new()
   while($reader.Read()){
    $r=[ordered]@{}
    for($i=0;$i -lt $reader.FieldCount;$i++){$r[$reader.GetName($i)]=if($reader.IsDBNull($i)){$null}elseif($reader.GetFieldType($i) -eq [DateTime]){$reader.GetDateTime($i).ToString('yyyy-MM-ddTHH:mm:ss.fffffff',[Globalization.CultureInfo]::InvariantCulture)}else{$reader.GetValue($i)}}
    $rows.Add([pscustomobject]$r)
   }
   $sets.Add($rows.ToArray())
  } while($reader.NextResult())
  $reader.Close()
  if($sets.Count -ne 6){throw 'Unexpected ERP result set count'}
  ConvertTo-Json -InputObject @{items=$sets[0];tasks=@();serials=$sets[1];movements=$sets[2];brands=$sets[3];routes=$sets[4];vouchers=$sets[5]} -Depth 8 -Compress
 }else{
  $ids=Get-Content -LiteralPath (Join-Path $CacheDir 'photo-ids.json') -Raw | ConvertFrom-Json
  $safeIds=@($ids | ForEach-Object{[long]$_});if($safeIds.Count -eq 0){Write-Output '{}';exit}
  $cmd.CommandText='SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; SELECT RecId,Attachment,Thumbnail FROM dbo.IM_ItemAttachment WHERE ISNULL(IsDeleted,0)=0 AND RecId IN ('+($safeIds -join ',')+');'
  $reader=$cmd.ExecuteReader();$outDir=Join-Path $CacheDir 'media/erp-photos';[IO.Directory]::CreateDirectory($outDir)|Out-Null;$count=0
  while($reader.Read()){$id=$reader.GetInt64(0);$bytes=if(-not $reader.IsDBNull(1)){$reader.GetValue(1)}elseif(-not $reader.IsDBNull(2)){$reader.GetValue(2)}else{$null};if($bytes -and $bytes.Length -ge 4 -and [Text.Encoding]::ASCII.GetString($bytes,0,4) -eq '%PDF' -and -not $reader.IsDBNull(2)){$bytes=$reader.GetValue(2)};if($bytes){[IO.File]::WriteAllBytes((Join-Path $outDir ($id.ToString()+'.bin')),$bytes);$count++}}
  ConvertTo-Json -InputObject @{downloaded=$count} -Compress
 }
}catch{
 $problem=$_.Exception.GetBaseException()
 if($problem -is [System.Data.SqlClient.SqlException]){
  [Console]::Error.WriteLine(('ERP {0} SQL {1} line {2}' -f $phase,$problem.Number,$problem.LineNumber))
 }else{[Console]::Error.WriteLine(('ERP {0} {1}' -f $phase,$problem.GetType().Name))}
 exit 1
}finally{$conn.Dispose()}
