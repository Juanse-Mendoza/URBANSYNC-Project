# Corre la app URBANSYNC en un celular Android conectado por USB.
# Uso (PowerShell, desde la carpeta app_movil):   .\correr_en_celular.ps1
#   Opcional: .\correr_en_celular.ps1 -Apk      -> solo genera el APK de instalación
param([switch]$Apk)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# El repo está dentro de OneDrive: si OneDrive sincroniza la carpeta build mientras Gradle
# compila, bloquea archivos ("Unable to delete directory ... mergeDebugAssets").
# Solución: build/ es un enlace (junction) a una carpeta FUERA de OneDrive.
$destinoBuild = Join-Path $env:LOCALAPPDATA 'urbansync_build'
$build = Get-Item build -ErrorAction SilentlyContinue
if (-not $build -or $build.LinkType -ne 'Junction') {
    Write-Host "Preparando build/ fuera de OneDrive ($destinoBuild) ..." -ForegroundColor Cyan
    if ($build) { Remove-Item -Recurse -Force build }
    New-Item -ItemType Directory -Force $destinoBuild | Out-Null
    cmd /c mklink /J build "$destinoBuild" | Out-Null
}

Write-Host "1/4 Verificando el backend en http://localhost:8080 ..." -ForegroundColor Cyan
try {
    $salud = Invoke-RestMethod -Uri 'http://localhost:8080/health' -TimeoutSec 5
    Write-Host "    Backend: $($salud.estado)" -ForegroundColor Green
} catch {
    Write-Host "    El backend no responde. Ejecuta primero en la raiz del repo: docker compose up -d" -ForegroundColor Red
    exit 1
}

if ($Apk) {
    Write-Host "Generando APK (release) que usa adb reverse (127.0.0.1:8080)..." -ForegroundColor Cyan
    flutter build apk --release --dart-define=API_URL=http://127.0.0.1:8080
    Write-Host "APK: build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor Green
    exit 0
}

Write-Host "2/4 Buscando el celular (adb devices) ..." -ForegroundColor Cyan
$dispositivos = (adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' }
if (-not $dispositivos) {
    Write-Host "    No hay celular autorizado. Revisa: cable USB, 'Depuracion USB' activa y acepta el aviso en el celular." -ForegroundColor Red
    adb devices
    exit 1
}
Write-Host "    Conectado: $($dispositivos -join ', ')" -ForegroundColor Green

Write-Host "3/4 Redirigiendo el puerto 8080 del celular al PC (adb reverse) ..." -ForegroundColor Cyan
adb reverse tcp:8080 tcp:8080 | Out-Null
adb reverse --list

Write-Host "4/4 Compilando e instalando la app (la primera vez tarda unos minutos) ..." -ForegroundColor Cyan
flutter run --dart-define=API_URL=http://127.0.0.1:8080
