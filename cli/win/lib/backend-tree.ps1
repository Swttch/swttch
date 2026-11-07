# lib/backend-tree.ps1 - labels and ports for a backend tree (see lib/proc.ps1 for discovery).

# "prod" runs the built backend.mjs, anything else is the dev server.
function Get-RootKind {
    param($Snap, [int]$RootId)
    if (Test-EntryCommand $Snap[$RootId] 'backend.mjs') { return 'prod' }
    return 'dev'
}

# Where the backend came from: "ide" (a JetBrains JVM is an ancestor), "standalone" (started
# by ccg or a shell), or "unknown".
function Get-RootRole {
    param($Snap, [int]$RootId)
    $cur = $RootId
    for ($i = 0; $i -lt 6; $i++) {
        $parent = $Snap[[int]$Snap[$cur].ParentProcessId]
        if (-not $parent) { break }
        $c = ([string]$parent.CommandLine + ' ' + $parent.Name).ToLower()
        if ($c -match 'jbr|idea|intellij|jetbrains|java|pycharm|webstorm|goland|rider|clion|phpstorm|rubymine|datagrip') { return 'ide' }
        if ($c -match 'main\.ps1|ccg\.cmd|powershell|pwsh|cmd\.exe|bash') { return 'standalone' }
        $cur = [int]$parent.ProcessId
    }
    return 'unknown'
}

# TCP ports the tree (root and descendants) listens on, lowest first.
function Get-TreePorts {
    param($Snap, [int]$RootId)
    $ids = @($RootId) + @(Get-Descendants $Snap $RootId)
    return @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ids -contains [int]$_.OwningProcess } | ForEach-Object { [int]$_.LocalPort } | Sort-Object -Unique)
}
