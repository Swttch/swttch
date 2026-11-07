# main.ps1 - claude-code-gui terminal launcher for native Windows (PowerShell).
#
# Lives next to bin\, not in it: only bin\ccg.cmd is on PATH. If a ccg.ps1 sat on PATH,
# PowerShell would prefer it over ccg.cmd and a restricted execution policy would block it.
#
# Usage: ccg [run | list | update | stop | version | doctor | self-update | uninstall | help]
#
# Entry point only: resolve paths, dot-source lib/* and commands/*, dispatch.
# Mirrors the bash `ccg` (cli/bin/ccg): same commands, same options.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Installation layout: <CcgRoot>\win\main.ps1, <CcgRoot>\win\bin\ccg.cmd, <CcgRoot>\win\lib, ...
$script:WinRoot = $PSScriptRoot
$script:CcgRoot = Split-Path -Parent $script:WinRoot
$script:CcgPort = if ($env:CCG_PORT) { [int]$env:CCG_PORT } else { 19836 }

foreach ($m in 'i18n', 'version', 'node', 'port', 'runtime', 'browser', 'spawn', 'proc', 'backend-tree') {
    . (Join-Path $script:WinRoot "lib\$m.ps1")
}
foreach ($m in 'help', 'version', 'doctor', 'run', 'list', 'stop', 'update', 'self-update', 'uninstall') {
    . (Join-Path $script:WinRoot "commands\$m.ps1")
}

Import-CcgLocale (Get-CcgLocale)

function Invoke-Ccg {
    param([string[]]$CcgArgs)
    $cmd = if ($CcgArgs.Count -gt 0) { $CcgArgs[0] } else { 'run' }
    $rest = if ($CcgArgs.Count -gt 1) { $CcgArgs[1..($CcgArgs.Count - 1)] } else { @() }

    switch ($cmd) {
        { $_ -in 'version', '--version', '-v' } { Invoke-CcgVersion $rest }
        'doctor' { Invoke-CcgDoctor $rest }
        { $_ -in 'help', '--help', '-h' } { Invoke-CcgHelp }
        'run' {
            $code = Invoke-CcgRun $rest
            exit ([int]($code | Select-Object -Last 1))
        }
        { $_ -in 'list', 'ls' } {
            $code = Invoke-CcgList $rest
            exit ([int]($code | Select-Object -Last 1))
        }
        'stop' {
            $code = Invoke-CcgStop $rest
            exit ([int]($code | Select-Object -Last 1))
        }
        'update' {
            $code = Invoke-CcgUpdate $rest
            exit ([int]($code | Select-Object -Last 1))
        }
        'self-update' {
            $code = Invoke-CcgSelfUpdate $rest
            exit ([int]($code | Select-Object -Last 1))
        }
        'uninstall' {
            $code = Invoke-CcgUninstall $rest
            exit ([int]($code | Select-Object -Last 1))
        }
        { $_ -in 'account', 'acct' } {
            [Console]::Error.WriteLine((T 'cmd_not_yet' $cmd))
            exit 1
        }
        default {
            [Console]::Error.WriteLine((T 'unknown_command' $cmd))
            Invoke-CcgHelp
            exit 1
        }
    }
}

Invoke-Ccg $args
