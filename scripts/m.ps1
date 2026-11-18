# Call a Mohit tool through the dev bridge:  ./scripts/m.ps1 start_app '{"project":"habits"}'
param([Parameter(Mandatory)] [string]$Tool, [string]$ArgsJson = "{}")
$body = '{"name":"' + $Tool + '","arguments":' + $ArgsJson + '}'
$r = Invoke-RestMethod -Uri http://127.0.0.1:4999/call -Method Post -Body $body -ContentType "application/json" -TimeoutSec 900
$status = if ($r.ok) { "OK" } else { "ERROR" }
"[$status $($r.ms)ms] $($r.text)"
