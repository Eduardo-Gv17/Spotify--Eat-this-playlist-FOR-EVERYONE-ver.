$ErrorActionPreference = 'Stop'
$taskSource = Join-Path $PSScriptRoot 'eat-this'
foreach ($taskFile in @('index.js', 'manifest.json', 'engine.js', 'spotify.js', 'board.js', 'extension.js', 'style.css')) {
    if (-not (Test-Path -LiteralPath (Join-Path $taskSource $taskFile) -PathType Leaf)) {
        throw "Falta eat-this/$taskFile. Conserva la carpeta eat-this junto a install.ps1 y vuelve a intentar."
    }
}
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    throw 'Instala y configura Spicetify primero: https://spicetify.app/docs/getting-started'
}
$taskConfigPath = (& spicetify -c | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $taskConfigPath -PathType Leaf)) {
    throw 'No se pudo localizar config-xpui.ini con spicetify -c.'
}
$taskDestination = Join-Path (Split-Path -Parent $taskConfigPath) 'CustomApps\eat-this'
New-Item -ItemType Directory -Force -Path $taskDestination | Out-Null
Get-ChildItem -LiteralPath $taskSource -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $taskDestination -Force
}
& spicetify config custom_apps eat-this
if ($LASTEXITCODE -ne 0) { throw 'No se pudo registrar Eat This.' }
& spicetify apply
if ($LASTEXITCODE -ne 0) { throw 'Spicetify no pudo aplicar el cambio.' }
Write-Host 'Eat This instalado. Abre Spotify y busca Eat This en la barra lateral.'
