# デスクトップに run-app.bat のショートカットを作成（任意）
$projectRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $projectRoot "run-app.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "実績管理アプリ起動.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = "運送業 実績・労務・生産性管理プロトタイプ"
$shortcut.Save()

Write-Host "デスクトップにショートカットを作成しました: $shortcutPath"
