# NexusCord Installer - frameless WebView2 window host (Windows PowerShell 5.1 / .NET Framework).
# Launched hidden by NexusCord-Installer.exe; shows the installer UI served on 127.0.0.1.
param(
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][string]$Dir,
    [Parameter(Mandatory = $true)][string]$DataDir
)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NcNative {
    [DllImport("user32.dll")] public static extern bool ReleaseCapture();
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool SetDllDirectory(string path);
    [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@

# Native WebView2Loader.dll for the current process architecture
$arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { 'x86' } }
[void][NcNative]::SetDllDirectory((Join-Path $Dir $arch))
[void][NcNative]::SetProcessDPIAware()

Add-Type -Path (Join-Path $Dir 'Microsoft.Web.WebView2.Core.dll')
Add-Type -Path (Join-Path $Dir 'Microsoft.Web.WebView2.WinForms.dll')

[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'NexusCord Installer'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
# 520x380 CSS pixels -> physical pixels for the monitor's DPI (WebView2 renders DPI-scaled)
$g = $form.CreateGraphics(); $scale = $g.DpiX / 96.0; $g.Dispose()
$form.ClientSize = New-Object System.Drawing.Size([int](520 * $scale), [int](380 * $scale))
$form.BackColor = [System.Drawing.Color]::FromArgb(14, 15, 22)
$form.ShowInTaskbar = $true

$form.Add_HandleCreated({
    # Windows 11: rounded corners (DWMWA_WINDOW_CORNER_PREFERENCE=33, ROUND=2) + dark mode (20)
    $round = 2; [void][NcNative]::DwmSetWindowAttribute($form.Handle, 33, [ref]$round, 4)
    $dark = 1; [void][NcNative]::DwmSetWindowAttribute($form.Handle, 20, [ref]$dark, 4)
})

$web = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$web.Dock = [System.Windows.Forms.DockStyle]::Fill
$web.DefaultBackgroundColor = $form.BackColor
$props = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
$props.UserDataFolder = $DataDir
$web.CreationProperties = $props

$web.Add_CoreWebView2InitializationCompleted({
    param($sender, $e)
    if (-not $e.IsSuccess) {
        [Console]::Error.WriteLine("WebView2 init failed: " + $e.InitializationException)
        [Environment]::Exit(3)
    }
    $s = $web.CoreWebView2.Settings
    $s.AreDefaultContextMenusEnabled = $false
    $s.IsStatusBarEnabled = $false
    $s.IsZoomControlEnabled = $false
    $s.AreBrowserAcceleratorKeysEnabled = $false
})

$web.Add_WebMessageReceived({
    param($sender, $e)
    switch ($e.TryGetWebMessageAsString()) {
        'drag' {
            [void][NcNative]::ReleaseCapture()
            [void][NcNative]::SendMessage($form.Handle, 0xA1, [IntPtr]2, [IntPtr]::Zero) # WM_NCLBUTTONDOWN, HTCAPTION
        }
        'minimize' { $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized }
        'close' { $form.Close() }
    }
})

$form.Controls.Add($web)
try {
    $web.Source = New-Object System.Uri($Url)
} catch {
    [Console]::Error.WriteLine("WebView2 unavailable: " + $_)
    exit 2
}
[System.Windows.Forms.Application]::Run($form)
exit 0
