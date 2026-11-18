param([ValidateSet('Snapshot','Photos')][string]$Mode='Snapshot')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$configPath=if($env:NUMUNE_ERP_CONFIG){$env:NUMUNE_ERP_CONFIG}else{'C:\Users\okay.dedeoglu\.codex\private-config\uff-erp-20261112.env'}
$cfg=@{}
Get-Content -LiteralPath $configPath | ForEach-Object {if($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$'){$cfg[$matches[1]]=$matches[2].Trim().Trim('"').Trim("'")}}
Add-Type -AssemblyName System.Data
$b=[System.Data.SqlClient.SqlConnectionStringBuilder]::new()
$b['Data Source']=$cfg['ERP_DB_SERVER']+','+$cfg['ERP_DB_PORT'];$b['Initial Catalog']=$cfg['ERP_DB_DATABASE'];$b['User ID']=$cfg['ERP_DB_USER'];$b['Password']=$cfg['ERP_DB_PASSWORD'];$b['Encrypt']=[bool]::Parse($cfg['ERP_DB_ENCRYPT']);$b['TrustServerCertificate']=[bool]::Parse($cfg['ERP_DB_TRUST_CERT']);$b['Connect Timeout']=8
$conn=[System.Data.SqlClient.SqlConnection]::new($b.ConnectionString)
try{
 $conn.Open();$cmd=$conn.CreateCommand();$cmd.CommandTimeout=30
 if($Mode -eq 'Snapshot'){
  # V2 uses barcode events and PatternNo; planned task rows do not drive this projection.
  $sets=[Collections.Generic.List[object]]::new()
  foreach($part in @('matches.sql','serials.sql','movements.sql','brands.sql','routes.sql','vouchers.sql')){
   $sql=Get-Content -LiteralPath (Join-Path $PSScriptRoot $part) -Raw
   if($part -in @('serials.sql','routes.sql','vouchers.sql')){$ids=@($sets[0] | ForEach-Object{[long]$_.RecId});$idText=if($ids.Count){$ids -join ','}else{'0'};$sql=$sql.Replace('{{MATCHED_IDS}}',$idText)}
   if($part -eq 'movements.sql'){$ids=@($sets[1] | ForEach-Object{[long]$_.SerialCardId});$idText=if($ids.Count){$ids -join ','}else{'0'};$sql=$sql.Replace('{{SERIAL_IDS}}',$idText)}
   $cmd.CommandText=$sql;$reader=$cmd.ExecuteReader();$rows=[Collections.Generic.List[object]]::new()
   while($reader.Read()){$r=[ordered]@{};for($i=0;$i -lt $reader.FieldCount;$i++){$r[$reader.GetName($i)]=if($reader.IsDBNull($i)){$null}else{$reader.GetValue($i)}};$rows.Add([pscustomobject]$r)}
   $reader.Close();$sets.Add($rows.ToArray())
  }
  ConvertTo-Json -InputObject @{items=$sets[0];tasks=@();serials=$sets[1];movements=$sets[2];brands=$sets[3];routes=$sets[4];vouchers=$sets[5]} -Depth 8 -Compress
 }else{
  $ids=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'cache/photo-ids.json') -Raw | ConvertFrom-Json
  $safeIds=@($ids | ForEach-Object{[long]$_});if($safeIds.Count -eq 0){Write-Output '{}';exit}
  $cmd.CommandText='SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED; SELECT RecId,Attachment,Thumbnail FROM dbo.IM_ItemAttachment WHERE ISNULL(IsDeleted,0)=0 AND RecId IN ('+($safeIds -join ',')+');'
  $reader=$cmd.ExecuteReader();$outDir=Join-Path $PSScriptRoot '../dist/erp-photos';[IO.Directory]::CreateDirectory($outDir)|Out-Null;$count=0
  while($reader.Read()){$id=$reader.GetInt64(0);$bytes=if(-not $reader.IsDBNull(1)){$reader.GetValue(1)}elseif(-not $reader.IsDBNull(2)){$reader.GetValue(2)}else{$null};if($bytes -and $bytes.Length -ge 4 -and [Text.Encoding]::ASCII.GetString($bytes,0,4) -eq '%PDF' -and -not $reader.IsDBNull(2)){$bytes=$reader.GetValue(2)};if($bytes){[IO.File]::WriteAllBytes((Join-Path $outDir ($id.ToString()+'.bin')),$bytes);$count++}}
  ConvertTo-Json -InputObject @{downloaded=$count} -Compress
 }
}catch{[Console]::Error.WriteLine('ERP okuma başarısız. Bağlantı ve okuma yetkisini kontrol edin.');exit 1}finally{$conn.Dispose()}
