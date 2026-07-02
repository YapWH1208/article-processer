param(
    [switch] $SkipInstall,
    [switch] $SkipElectronPackage
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ApiRoot = Join-Path $RepoRoot "services/api"
$WebRoot = Join-Path $RepoRoot "apps/web"
$DesktopRoot = Join-Path $RepoRoot "apps/desktop"
$IsWindowsPlatform = ($PSVersionTable.PSEdition -eq "Desktop") -or $IsWindows
$Npm = if ($IsWindowsPlatform) { "npm.cmd" } else { "npm" }

function Run-Step {
    param(
        [string] $Name,
        [scriptblock] $Command
    )

    Write-Host ""
    Write-Host "==> $Name"
    & $Command
}

Run-Step "Install backend desktop dependencies" {
    if (-not $SkipInstall) {
        Push-Location $ApiRoot
        try {
            python -m pip install --upgrade pip
            python -m pip install -e ".[desktop]"
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Host "Skipped"
    }
}

Run-Step "Install frontend dependencies" {
    if (-not $SkipInstall) {
        & $Npm --prefix $WebRoot ci
    }
    else {
        Write-Host "Skipped"
    }
}

Run-Step "Install desktop dependencies" {
    if (-not $SkipInstall) {
        & $Npm --prefix $DesktopRoot ci
    }
    else {
        Write-Host "Skipped"
    }
}

Run-Step "Build backend sidecar" {
    Push-Location $ApiRoot
    try {
        python -m PyInstaller app/desktop_app.spec --clean --noconfirm
    }
    finally {
        Pop-Location
    }
}

Run-Step "Build Next standalone frontend" {
    & $Npm --prefix $WebRoot run build
}

Run-Step "Run desktop helper tests" {
    & $Npm --prefix $DesktopRoot test
}

if (-not $SkipElectronPackage) {
    Run-Step "Package Electron desktop app" {
        & $Npm --prefix $DesktopRoot run dist -- --publish never
    }
}
else {
    Write-Host ""
    Write-Host "==> Package Electron desktop app"
    Write-Host "Skipped"
}
