# Generates the PNG icons for the plugin. Windows-only (System.Drawing); the
# generated PNGs are committed, so this only needs to run when art changes.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot

function New-RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-StatusBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(1, [Math]::Round($size * 0.04))
    $radius = [Math]::Max(2, [Math]::Round($size * 0.14))
    $path = New-RoundedPath $pad $pad ($size - $pad * 2) ($size - $pad * 2) $radius
    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 21, 23, 28))
    $g.FillPath($bg, $path)

    $colors = @(
        [System.Drawing.Color]::FromArgb(255, 61, 220, 132),
        [System.Drawing.Color]::FromArgb(255, 245, 166, 35),
        [System.Drawing.Color]::FromArgb(255, 77, 163, 255)
    )
    $rows = 3
    $dotSize = [Math]::Max(2, [Math]::Round($size * 0.16))
    $gap = ($size - $dotSize * $rows) / ($rows + 1)
    for ($i = 0; $i -lt $rows; $i++) {
        $y = $gap + ($dotSize + $gap) * $i
        $brush = New-Object System.Drawing.SolidBrush($colors[$i])
        $dotX = $size - $pad - $dotSize - [Math]::Max(1, [Math]::Round($size * 0.12))
        $g.FillEllipse($brush, $dotX, $y, $dotSize, $dotSize)
        $barW = $size - $pad * 2 - $dotSize - [Math]::Round($size * 0.24)
        $barH = [Math]::Max(1, [Math]::Round($size * 0.08))
        $g.FillRectangle($brush, ($pad + [Math]::Round($size * 0.1)), ($y + ($dotSize - $barH) / 2), $barW, $barH)
        $brush.Dispose()
    }

    $bg.Dispose()
    $g.Dispose()
    return $bmp
}

function Save-Bitmap($bitmap, [string]$path) {
    $dir = Split-Path -Parent $path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Host "wrote $path"
}

$plugin = Join-Path $root "com.lucaslosi.paseo-status.sdPlugin"
Save-Bitmap (New-StatusBitmap 256) (Join-Path $plugin "imgs/plugin/marketplace.png")
Save-Bitmap (New-StatusBitmap 512) (Join-Path $plugin "imgs/plugin/marketplace@2x.png")
Save-Bitmap (New-StatusBitmap 28) (Join-Path $plugin "imgs/plugin/category-icon.png")
Save-Bitmap (New-StatusBitmap 56) (Join-Path $plugin "imgs/plugin/category-icon@2x.png")
Save-Bitmap (New-StatusBitmap 20) (Join-Path $plugin "imgs/actions/status/icon.png")
Save-Bitmap (New-StatusBitmap 40) (Join-Path $plugin "imgs/actions/status/icon@2x.png")
Save-Bitmap (New-StatusBitmap 72) (Join-Path $plugin "imgs/actions/status/key.png")
Save-Bitmap (New-StatusBitmap 144) (Join-Path $plugin "imgs/actions/status/key@2x.png")
