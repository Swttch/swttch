# commands/help.ps1 - `ccg help`: top-level usage.

function Invoke-CcgHelp {
    Write-Output (T 'usage_header')
    Write-Output ''
    Write-Output (T 'help_body')
}
