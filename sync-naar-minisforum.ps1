# sync-naar-minisforum.ps1
#
# Een commando om de huidige stand van backend/ en frontend/ (op deze
# Windows-pc) naar de Minisforum te sturen en de app daar te herstarten.
# Bewust GEEN git - Lex wilde dat (nog) niet, dit is de tussenoplossing
# voor "handig zonder te veel gedoe".
#
# Sluit uit: backend/.env (bevat huisadres-coordinaten, nooit overschrijven),
# node_modules, .git, en de losse test/demo-bestanden
# (kaart-vergelijking.html, simulatie-fotostrip.html) - dezelfde
# uitsluitingen als bij de eerste deployment.
#
# Herstart-logica is dubbel: gebruikt de systemd-service als die al
# geinstalleerd is, valt anders terug op de nohup-aanpak - werkt dus
# ongeacht of de systemd-stap al is uitgevoerd.
#
# Gebruik (vanuit C:\Projects\Weer):
#   powershell -ExecutionPolicy Bypass -File .\sync-naar-minisforum.ps1
#
# Vereist: OpenSSH-client (standaard aanwezig sinds Windows 10), en dat je
# met "ssh lex@lexdev-nw" al zonder gedoe kunt inloggen (evt. met
# wachtwoordprompt - dat is prima, gebeurt hier ook gewoon).
#
# 2026-08-19: eerdere versie gebruikte een PowerShell-here-string (@'...'@)
# om het remote-herstartscript naar ssh's stdin te pipen - dat gaf op Lex'
# Windows-pc een parse-fout ("missing terminator"), vermoedelijk door hoe
# Windows PowerShell 5.1 het bestand inleest (encoding/regeleinde-gevoelig
# gebied). Nu vervangen door een aanpak zonder here-string en zonder
# niet-ASCII-tekens in het script zelf: het remote-script wordt regel voor
# regel als platte ASCII-tekst weggeschreven naar een los tijdelijk
# .sh-bestand (met expliciete LF-regeleinden via .NET's File.WriteAllText,
# om een BOM of CRLF-verrassingen in het bash-scriptje te vermijden), en
# dat bestand wordt gewoon gescp't en op de Minisforum uitgevoerd.

$ErrorActionPreference = "Stop"

$projectDir = $PSScriptRoot
$tarPad = Join-Path $env:TEMP "weer-app-sync.tar.gz"
$remoteScriptPad = Join-Path $env:TEMP "weer-app-remote-restart.sh"
$doel = "lex@lexdev-nw"

Write-Host "Bestanden inpakken..." -ForegroundColor Cyan
# 2026-08-20: backend/data/ erbij uitgesloten - dat is de op-schijf-historie
# van historie.js (zie backend/src/historie.js), puur runtime-state van de
# LEVENDE server (op de Minisforum als root aangemaakt/bijgewerkt, niet
# vanaf Windows). Zonder deze uitsluiting probeerde tar dat root-eigen
# bestand op de server te overschrijven, wat als gewone (niet-sudo)
# gebruiker faalt met "Cannot utime/Permission denied" - en daarmee de HELE
# sync (inclusief npm install + herstart hieronder) liet mislukken, want
# die stappen komen pas na deze tar-aanroep.
tar --exclude=".env" `
    --exclude="backend/data" `
    --exclude="kaart-vergelijking.html" `
    --exclude="simulatie-fotostrip.html" `
    --exclude="node_modules" `
    --exclude=".git" `
    -czf $tarPad -C $projectDir backend frontend

if (-not (Test-Path $tarPad)) {
    Write-Error "Inpakken mislukt - geen tar.gz aangemaakt."
    exit 1
}

Write-Host "Versturen naar $doel..." -ForegroundColor Cyan
scp $tarPad "${doel}:~/weer-app-sync.tar.gz"

Write-Host "Herstart-script voorbereiden..." -ForegroundColor Cyan
$remoteLines = @(
    'set -e',
    'cd ~/weer-app',
    'tar --overwrite -xzf ~/weer-app-sync.tar.gz',
    'rm ~/weer-app-sync.tar.gz',
    '',
    '# 2026-08-20: nieuwe/gewijzigde dependencies (package.json) worden nu',
    '# altijd meteen geinstalleerd, VOOR de herstart hieronder - node_modules',
    '# wordt bewust niet gesynced (zie de --exclude hierboven), dus zonder',
    '# deze stap zou een nieuwe dependency (bv. cheerio voor navtex.js) de',
    '# hele service laten crashen bij het opstarten. npm install is snel/',
    '# no-op als er toch niks veranderd is, dus altijd uitvoeren kan geen kwaad.',
    'cd ~/weer-app/backend',
    'npm install --omit=dev --no-audit --no-fund',
    'cd ~/weer-app',
    '',
    'if systemctl list-unit-files 2>/dev/null | grep -q "weer-app@"; then',
    '  sudo systemctl restart "weer-app@$(whoami).service"',
    '  echo "[sync] herstart via systemd"',
    'else',
    '  pkill -f "node src/index.js" || true',
    '  sleep 1',
    '  cd ~/weer-app/backend',
    '  nohup node src/index.js > weer-app.log 2>&1 &',
    '  disown',
    '  echo "[sync] herstart via nohup (systemd nog niet actief op deze server)"',
    'fi',
    'rm -f ~/weer-app-remote-restart.sh'
)
[System.IO.File]::WriteAllText($remoteScriptPad, ($remoteLines -join "`n") + "`n")

Write-Host "Versturen en uitvoeren op de Minisforum..." -ForegroundColor Cyan
scp $remoteScriptPad "${doel}:~/weer-app-remote-restart.sh"
ssh $doel "bash ~/weer-app-remote-restart.sh"
# 2026-08-20: tot nu toe werd $LASTEXITCODE hier nooit gecheckt, dus een
# mislukt remote-script (bv. de tar-permissiefout hierboven) liet gewoon
# stilzwijgend "Klaar" zien alsof de deploy geslaagd was - terwijl het
# remote-script (dankzij "set -e") op zo'n fout meteen stopt en dus ook npm
# install/de herstart NOOIT bereikt. Nu een duidelijke waarschuwing i.p.v.
# een vals-groen "Klaar".
$remoteExitCode = $LASTEXITCODE

Remove-Item $tarPad
Remove-Item $remoteScriptPad

if ($remoteExitCode -ne 0) {
    Write-Warning "Remote-script gaf een foutcode ($remoteExitCode) - deploy is NIET voltooid (npm install/herstart is waarschijnlijk overgeslagen). Bekijk de foutmelding hierboven."
    exit $remoteExitCode
}
Write-Host "Klaar. Check: curl http://lexdev-nw:4780/api/status" -ForegroundColor Green
