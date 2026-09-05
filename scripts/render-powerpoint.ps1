# Run in an interactive Windows desktop session with licensed Microsoft PowerPoint.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$InputFile,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [ValidateRange(320,7680)][int]$Width = 1920,
    [switch]$Video,
    [ValidateRange(30,3600)][int]$VideoTimeoutSeconds = 600
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::UserInteractive) {
    throw 'Native rendering requires an interactive Windows desktop with licensed PowerPoint.'
}
if (Get-Process -Name POWERPNT -ErrorAction SilentlyContinue) { throw 'Close PowerPoint before running this dedicated rendering session.' }
$source = (Resolve-Path -LiteralPath $InputFile).Path
if ([IO.Path]::GetExtension($source) -ine '.pptx') { throw 'Choose a .pptx file.' }
$destination = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $destination) { throw 'OutputDirectory must be new; existing evidence is never overwritten.' }
New-Item -ItemType Directory -Path $destination | Out-Null
$app = $null; $presentation = $null
try {
    $app = New-Object -ComObject PowerPoint.Application
    $app.Visible = -1
    # Disable macros before opening any supplied document. Do not suppress Office security dialogs.
    $app.AutomationSecurity = 3
    $presentation = $app.Presentations.Open($source, -1, 0, -1)
    $height = [int][Math]::Round($Width * $presentation.PageSetup.SlideHeight / $presentation.PageSetup.SlideWidth)
    $files = @()
    $presentation.ExportAsFixedFormat((Join-Path $destination 'presentation.pdf'), 2)
    $files += 'presentation.pdf'
    for ($i = 1; $i -le $presentation.Slides.Count; $i++) {
        $name = 'slide-{0:D3}.png' -f $i
        $slide = $presentation.Slides.Item($i)
        try { $slide.Export((Join-Path $destination $name), 'PNG', $Width, $height) }
        finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($slide) }
        $files += $name
    }
    if ($Video) {
        $presentation.CreateVideo((Join-Path $destination 'presentation.mp4'), $true, 5, $height, 30, 85)
        $deadline = [DateTime]::UtcNow.AddSeconds($VideoTimeoutSeconds)
        do {
            Start-Sleep -Seconds 1
            $status = [int]$presentation.CreateVideoStatus
            if ($status -eq 4) { throw 'PowerPoint video rendering failed.' }
            if ([DateTime]::UtcNow -gt $deadline) { throw 'PowerPoint video rendering timed out; evidence is incomplete.' }
        } while ($status -ne 3)
        $files += 'presentation.mp4'
    }
    $artifacts = @($files | ForEach-Object {
        $file = Get-Item -LiteralPath (Join-Path $destination $_)
        if ($file.Length -eq 0) { throw "Empty native artifact: $_" }
        @{ file = $_; bytes = $file.Length; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    $manifest = @{
        format = 'paperdom-native-render'; version = 1; renderer = 'Microsoft PowerPoint'
        rendererVersion = [string]$app.Version; rendererBuild = [string]$app.Build
        sourceSha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        slideCount = $presentation.Slides.Count; width = $Width; height = $height
        renderedAt = [DateTime]::UtcNow.ToString('o'); video = [bool]$Video; artifacts = $artifacts
    }
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination 'native-render.json') -Encoding UTF8
    Write-Output "Native evidence saved to $destination"
} finally {
    if ($null -ne $presentation) { $presentation.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) }
    if ($null -ne $app) { $app.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($app) }
}
