# commands/list.ps1 - `ccg list`: show the backend process trees.

function Write-ChildTree {
    param($Snap, [int]$ParentId, [int]$Depth)
    $prefix = '    ' * ($Depth - 1)
    foreach ($c in (Get-ChildPids $Snap $ParentId)) {
        Write-Host ($prefix + (T 'list_child' $c (Get-ProcessLabel $Snap[$c])))
        Write-ChildTree $Snap $c ($Depth + 1)
    }
}

# "node.exe C:/x/backend.mjs": the process name followed by its arguments, slashes forward.
function Get-ProcessLabel {
    param($Proc)
    $c = [string]$Proc.CommandLine
    if (-not $c) { return $Proc.Name }
    if ($c.StartsWith('"')) { $args1 = $c.Substring($c.IndexOf('"', 1) + 1).Trim() }
    else { $i = $c.IndexOf(' '); $args1 = if ($i -ge 0) { $c.Substring($i + 1) } else { '' } }
    return (($Proc.Name + ' ' + $args1).Trim()).Replace('\', '/')
}

function Invoke-CcgList {
    param([string[]]$CcgArgs)
    if ($CcgArgs -contains '-h' -or $CcgArgs -contains '--help') {
        Write-Host (T 'help_list_header'); Write-Host ''; Write-Host (T 'help_list_body')
        Write-Host ''; Write-Host (T 'list_help_hint' $script:CcgPort)
        return 0
    }
    if ($CcgArgs.Count -gt 0) {
        [Console]::Error.WriteLine("unknown argument: $($CcgArgs[0])")
        return 1
    }
    Write-Host (T 'list_header')
    $snap = Get-ProcessSnapshot
    $roots = @(Get-BackendRoots $snap)
    if ($roots.Count -eq 0) { Write-Host (T 'list_none'); Write-Host ''; return 0 }
    foreach ($root in $roots) {
        $kind = Get-RootKind $snap $root
        $role = Get-RootRole $snap $root
        $ports = @(Get-TreePorts $snap $root)
        if ($ports.Count -gt 0) {
            $confirmed = Get-BackendVersion $ports[0]
            $marker = if ($confirmed) { T 'list_port_confirmed' } else { T 'list_port_unconfirmed' }
            Write-Host (T 'list_root_with_port' $root $ports[0] $marker $kind $role)
        } else {
            Write-Host (T 'list_root_no_port' $root $kind $role)
        }
        Write-Host ('    ' + (Get-ProcessLabel $snap[$root]))
        Write-ChildTree $snap $root 1
    }
    return 0
}
