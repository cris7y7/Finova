Add-Type -AssemblyName System.Drawing

$src = "C:\Users\Windows 11\.gemini\antigravity-ide\brain\08db205e-7abd-4324-9afc-9f70f5b8f8f6\media__1785903438301.png"
$baseDir = "c:\Users\Windows 11\OneDrive\Desktop\GastosApp v0.1"

if (-not (Test-Path $src)) {
    Write-Host "Source image not found"
    exit 1
}

$origImg = [System.Drawing.Image]::FromFile($src)

function Resize-Image {
    param(
        [System.Drawing.Image]$img,
        [int]$width,
        [int]$height,
        [string]$outputPath
    )
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $width, $height)
    
    $dir = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$androidMap = @(
    @{ Folder = "mipmap-mdpi"; Size = 48; Fg = 108 },
    @{ Folder = "mipmap-hdpi"; Size = 72; Fg = 162 },
    @{ Folder = "mipmap-xhdpi"; Size = 96; Fg = 216 },
    @{ Folder = "mipmap-xxhdpi"; Size = 144; Fg = 324 },
    @{ Folder = "mipmap-xxxhdpi"; Size = 192; Fg = 432 }
)

foreach ($item in $androidMap) {
    $targetDir = "$baseDir\android\app\src\main\res\$($item.Folder)"
    Resize-Image -img $origImg -width $item.Size -height $item.Size -outputPath "$targetDir\ic_launcher.png"
    Resize-Image -img $origImg -width $item.Size -height $item.Size -outputPath "$targetDir\ic_launcher_round.png"
    Resize-Image -img $origImg -width $item.Fg -height $item.Fg -outputPath "$targetDir\ic_launcher_foreground.png"
    Write-Host "Updated $($item.Folder)"
}

$webSizes = @(48, 72, 96, 128, 192, 256, 512)
foreach ($sz in $webSizes) {
    $targetWeb = "$baseDir\www\icons\icon-$sz.png"
    Resize-Image -img $origImg -width $sz -height $sz -outputPath $targetWeb
}

Resize-Image -img $origImg -width 512 -height 512 -outputPath "$baseDir\www\app\logo.png"
Resize-Image -img $origImg -width 512 -height 512 -outputPath "$baseDir\www\logo.png"
Resize-Image -img $origImg -width 64 -height 64 -outputPath "$baseDir\www\app\favicon.png"
Resize-Image -img $origImg -width 64 -height 64 -outputPath "$baseDir\www\favicon.png"

$origImg.Dispose()
Write-Host "ALL ICONS UPDATED SUCCESSFULLY!"
