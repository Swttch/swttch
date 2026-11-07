# lib/i18n.ps1 - message lookup. Messages live in locales/<lang>.ps1 as a $Messages
# hashtable; T <key> [args...] formats with {0}, {1}. English is the fallback.

$script:Messages = @{}
$script:MessagesEn = @{}

function Get-CcgLocale {
    if ($env:CCG_LANG) { return $env:CCG_LANG.Substring(0, [Math]::Min(2, $env:CCG_LANG.Length)).ToLower() }
    return (Get-Culture).TwoLetterISOLanguageName.ToLower()
}

function Import-CcgLocale {
    param([string]$Lang)
    $dir = Join-Path $script:WinRoot 'locales'
    . (Join-Path $dir 'en.ps1')
    $script:MessagesEn = $Messages
    $file = Join-Path $dir "$Lang.ps1"
    if (($Lang -ne 'en') -and (Test-Path $file)) {
        . $file
        $script:Messages = $Messages
    } else {
        $script:Messages = $script:MessagesEn
    }
}

function T {
    param([string]$Key)
    $template = $script:Messages[$Key]
    if ($null -eq $template) { $template = $script:MessagesEn[$Key] }
    if ($null -eq $template) { return "<<$Key>>" }
    if ($args.Count -gt 0) { return [string]::Format($template, $args) }
    return $template
}
