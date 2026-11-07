# commands/help.ps1 - `ccg help`: top-level usage.

function Invoke-CcgHelp {
    if ($script:Program -eq 'swttch') {
        Write-Output (T 'swttch_usage_header')
        Write-Output ''
        Write-Output (T 'help_swttch_body')
        return
    }
    Write-Output (T 'usage_header')
    Write-Output ''
    Write-Output (T 'help_body')
}
