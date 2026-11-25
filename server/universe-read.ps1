param([switch]$Membership)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'tracking-since.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
    $config=$env:NUMUNE_UNIVERSE_SETTINGS
    if (-not $config) { throw 'NUMUNE_UNIVERSE_SETTINGS is required.' }
    $settings=Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
    $builder=[System.Data.SqlClient.SqlConnectionStringBuilder]::new(
        ($settings.ConnectionStrings.DefaultConnection -replace '(?i)(^|;)\s*Command Timeout\s*=\s*[^;]*',''))
    $builder['Connect Timeout']=8
    $builder['Application Name']='NTS catalog reader'
    $db=[System.Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
    $db.Open()
    $cmd=$db.CreateCommand()
    $cmd.CommandTimeout=35
    $since=Read-TrackingSince
    $cutoff=$cmd.Parameters.Add('@since',[System.Data.SqlDbType]::DateTimeOffset)
    $cutoff.Scale=7
    $cutoff.Value=$since
    if ($Membership) {
        $ids=$cmd.Parameters.Add('@styles',[System.Data.SqlDbType]::NVarChar,-1)
        $ids.Value=[Console]::In.ReadToEnd()
        $cmd.CommandText=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'universe-membership.sql') -Raw
    } else {
        $cmd.CommandText=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'universe-recent.sql') -Raw
    }
    $cmd.CommandText="DECLARE @until datetimeoffset(7)=TODATETIMEOFFSET(SYSUTCDATETIME(),'+00:00');"+[Environment]::NewLine+$cmd.CommandText
    $cmd.CommandText=$cmd.CommandText.Trim().TrimEnd(';')+' FOR JSON PATH, INCLUDE_NULL_VALUES;'
    $reader=$cmd.ExecuteReader()
    $json=[Text.StringBuilder]::new()
    while ($reader.Read()) {
        [void]$json.Append($reader.GetString(0))
    }
    if ($json.Length -eq 0) { [Console]::Write('[]') } else { [Console]::Write($json.ToString()) }
} catch {
    [Console]::Error.WriteLine('Universe read unavailable.')
    exit 1
} finally {
    if ($db) { $db.Dispose() }
}
