package com.github.yhk1038.claudecodegui.bridge

/**
 * The spellings under which the IDE may know a file the Node backend asked it to open.
 *
 * The backend names a file the way it sees it. When the backend runs inside WSL while
 * the IDE runs on Windows, that is a Linux path (`/home/me/proj/x.png`, or `/mnt/c/Users/…`
 * for a Windows file), which the Windows IDE cannot look up as written. This object is
 * pure path math so it can be tested without the IntelliJ platform; the lookup itself
 * lives in the caller.
 *
 * Background: issue #567.
 */
object OpenFileTargets {

    // `/mnt/c/Users/me/x.png` — WSL's mount of a Windows drive.
    private val MNT_DRIVE = Regex("^/mnt/([A-Za-z])/(.*)$")

    /**
     * Every spelling of [path] worth looking up on the IDE side, best first. The first
     * entry is always [path] itself.
     *
     * Only a Windows IDE ([isWindows]) has anything else to try:
     * - `/mnt/c/Users/me/x.png`        -> `C:/Users/me/x.png`
     * - `/home/me/proj/x.png` while the project lives in WSL (its [projectBasePath] is a
     *   `\\wsl.localhost\Ubuntu\…` or `\\wsl$\Ubuntu\…` UNC path)
     *                                  -> `//wsl.localhost/Ubuntu/home/me/proj/x.png`
     *
     * The UNC form uses forward slashes and the same host spelling as the project, which
     * is how the IDE's virtual file system names such a location.
     */
    fun candidates(path: String, projectBasePath: String?, isWindows: Boolean): List<String> {
        val spellings = linkedSetOf(path)
        if (!isWindows) return spellings.toList()

        MNT_DRIVE.matchEntire(path)?.let { match ->
            spellings += "${match.groupValues[1].uppercase()}:/${match.groupValues[2]}"
        }

        val isLinuxAbsolute = path.startsWith("/") && !path.startsWith("//")
        if (isLinuxAbsolute) {
            val location = WslPathResolver.parseUncPath(projectBasePath)
            if (location != null && projectBasePath != null) {
                val host = projectBasePath.replace('\\', '/').trimStart('/').substringBefore('/')
                spellings += "//$host/${location.distro}$path"
            }
        }
        return spellings.toList()
    }
}
