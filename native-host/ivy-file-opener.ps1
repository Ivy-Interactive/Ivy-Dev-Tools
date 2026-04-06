# Native messaging host for Ivy Dev Tools.
# Reads one JSON message from Chrome, opens the file in the requested IDE, responds with JSON.

$ErrorActionPreference = "Stop"

function Read-NativeMessage {
    $stdin = [System.Console]::OpenStandardInput()
    $lenBuf = New-Object byte[] 4
    $read = $stdin.Read($lenBuf, 0, 4)
    if ($read -lt 4) { return $null }
    $len = [BitConverter]::ToInt32($lenBuf, 0)
    if ($len -le 0 -or $len -gt 1048576) { return $null }
    $msgBuf = New-Object byte[] $len
    $totalRead = 0
    while ($totalRead -lt $len) {
        $r = $stdin.Read($msgBuf, $totalRead, $len - $totalRead)
        if ($r -le 0) { break }
        $totalRead += $r
    }
    $json = [System.Text.Encoding]::UTF8.GetString($msgBuf, 0, $totalRead)
    return $json | ConvertFrom-Json
}

function Write-NativeMessage($obj) {
    $json = $obj | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $len = [BitConverter]::GetBytes([int]$bytes.Length)
    $stdout = [System.Console]::OpenStandardOutput()
    $stdout.Write($len, 0, 4)
    $stdout.Write($bytes, 0, $bytes.Length)
    $stdout.Flush()
}

try {
    $msg = Read-NativeMessage
    if (-not $msg) {
        Write-NativeMessage @{ success = $false; error = "No message received" }
        exit 0
    }

    $ide = $msg.ide
    $file = $msg.file
    $line = $msg.line

    if (-not $file) {
        Write-NativeMessage @{ success = $false; error = "No file specified" }
        exit 0
    }

    switch ($ide) {
        "rider" {
            # Find Rider executable
            $riderExe = $null
            $riderDirs = Get-ChildItem "C:\Program Files\JetBrains" -Directory -Filter "JetBrains Rider*" -ErrorAction SilentlyContinue | Sort-Object Name -Descending
            foreach ($d in $riderDirs) {
                $candidate = Join-Path $d.FullName "bin\rider64.exe"
                if (Test-Path $candidate) { $riderExe = $candidate; break }
            }
            if (-not $riderExe) {
                Write-NativeMessage @{ success = $false; error = "Rider not found" }
                exit 0
            }
            $args = @()
            if ($line) { $args += "--line"; $args += "$line" }
            $args += $file
            Start-Process -FilePath $riderExe -ArgumentList $args
            Write-NativeMessage @{ success = $true; ide = "rider" }
        }
        "vscode" {
            $uri = "vscode://file/$($file -replace '\\','/')"
            if ($line) { $uri += ":$line" }
            Start-Process $uri
            Write-NativeMessage @{ success = $true; ide = "vscode" }
        }
        default {
            Write-NativeMessage @{ success = $false; error = "Unknown IDE: $ide" }
        }
    }
} catch {
    try { Write-NativeMessage @{ success = $false; error = $_.Exception.Message } } catch {}
}
