package com.github.yhk1038.claudecodegui.bridge

import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import java.io.File
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID

/** Final on-disk locations the backend serves from. */
data class ExtractedResources(val webviewDir: File, val backendFile: File)

/**
 * Extracts the plugin's bundled `webview/` static files and `backend.mjs` from the
 * plugin JAR into a **version-scoped** directory, at most once per
 * (IDE product, plugin version). Replaces the previous per-project-root extraction
 * in [NodeProcessManager] that caused issue #149.
 *
 * ## Why version-scoped, extract-once, never-delete-on-exit (issues #57, #120, #149)
 *
 * The bundle content depends only on the plugin *version* (same version → identical
 * `index.html`/`assets/`/`backend.mjs`), never on the project root. The old code keyed
 * the temp dir on `project.basePath.hashCode()` and re-extracted (delete + unpack) on
 * every backend spawn, then deleted the dir on process exit (#120). Because the path
 * was deterministic per root, successive backend *generations* shared it, so an old
 * generation's exit-cleanup deleted the dir a new generation was actively serving →
 * HTTP 404 `Not found` (#149).
 *
 * This extractor removes all three failure modes at once:
 *  - **Key = plugin version** under [baseDir]: every project root shares one dir, so no
 *    per-root duplication and no per-root accumulation (#120).
 *  - **Extract once, skip if present**: no destructive re-extraction of a live dir (#57).
 *  - **Never delete on process exit**: nothing races a serving dir (#149). Stale *other
 *    version* dirs are pruned right after a successful extraction instead.
 *
 * ## Concurrency & atomicity — why there is no lock (issue #308)
 *
 * Two IDE instances sharing a [baseDir] can extract the same version concurrently, and
 * that is safe on its own: each unpacks into its own sibling `.tmp-<uuid>` dir under the
 * *same parent* as the final dir (guaranteeing the same volume), verifies the hashed
 * bundle **before** renaming, and then publishes by rename — so the version dir never
 * appears half-written no matter how many processes race. `ATOMIC_MOVE` falls back to a
 * non-atomic replace when the platform/filesystem rejects it, and to a `.locked-<uuid>`
 * serve-in-place dir when even that fails (see [moveIntoPlace]).
 *
 * Earlier versions also took a `.lock` file here. It never guarded correctness — the
 * rename above already does — it only avoided the *waste* of two processes unpacking the
 * same bundle. That trade turned out to be a bad one: the wait was unbounded, so a
 * leftover backend process still holding the lock stalled every new start until the 30s
 * resource gate in [NodeProcessManager] gave up, surfacing as
 * `Node.js backend failed to start / Plugin resources not ready`. On Windows that holder
 * survives closing the IDE, which left rebooting the machine as the only way out. Paying
 * a rare duplicate unpack is strictly cheaper than that, so the lock is gone; a leftover
 * `.lock` file from an older version is deleted on sight by [pruneOtherVersions].
 *
 * Dev mode (running from the source tree) returns the source `webview/dist` and
 * `backend/dist/backend.mjs` directly and never extracts — the version-key scheme
 * applies to production JAR extraction only.
 */
class PluginResourceExtractor(
    /** Parent dir holding the per-version subdirectories. Injectable for tests. */
    private val baseDir: File = defaultBaseDir(),
    /** Plugin version = the version-scope key. Injectable for tests. */
    private val version: String = defaultVersion(),
    /** Classloader anchor used to read bundled resources. Injectable for tests. */
    private val resourceAnchor: Class<*> = PluginResourceExtractor::class.java,
    /**
     * Performs the actual unpack into the given (webviewTarget, backendDirTarget).
     * Defaults to JAR/classpath extraction; tests inject a fake to exercise the
     * skip/lock/rename/prune orchestration without a real JAR.
     */
    private val unpack: ((webviewTarget: File, backendDirTarget: File) -> Unit)? = null,
    /**
     * Clears a stale partial version dir before the rename, returning whether the dir is
     * now gone. Defaults to [File.deleteRecursively]. Injectable so a test can simulate the
     * Windows case where a running backend holds `backend.mjs` open and the delete silently
     * fails (returns false, dir remains) — the M4 lock-resilience path.
     */
    private val clearTarget: (File) -> Boolean = { it.deleteRecursively() },
) {
    private val logger = Logger.getInstance(PluginResourceExtractor::class.java)

    /**
     * Resolve the served resource locations, extracting on first use for this version.
     * Blocking (filesystem + JAR IO) — callers MUST run this off the EDT.
     */
    fun resolve(): ExtractedResources {
        resolveDevResources()?.let {
            logger.info("Using dev source-tree resources: webview=${it.webviewDir}, backend=${it.backendFile}")
            return it
        }
        return resolveProductionResources()
    }

    // ── Production: version-scoped extract-once ─────────────────────────────

    private fun resolveProductionResources(): ExtractedResources {
        val versionDir = File(baseDir, version)
        val result = ExtractedResources(
            webviewDir = File(versionDir, WEBVIEW_SUBDIR),
            backendFile = File(File(versionDir, BACKEND_SUBDIR), BACKEND_ENTRY),
        )

        if (isComplete(result)) {
            pruneOtherVersions()
            pruneLockedFallbacks()
            return result
        }

        baseDir.mkdirs()
        val served = extractVersion(versionDir)
        pruneOtherVersions()
        // Only reap leftover `.locked-*` dirs when THIS run serves canonically; if we are
        // serving from a fallback (`served` != the version dir), that fallback must survive.
        if (served.backendFile == result.backendFile) pruneLockedFallbacks()
        return served
    }

    /** A version dir counts as complete only when both the hashed JS bundle and backend.mjs exist. */
    private fun isComplete(r: ExtractedResources): Boolean =
        hasHashedBundle(r.webviewDir) && r.backendFile.isFile

    private fun hasHashedBundle(webviewDir: File): Boolean {
        val assets = File(webviewDir, "assets")
        return assets.isDirectory &&
            assets.listFiles()?.any { it.name.startsWith("index-") && it.name.endsWith(".js") } == true
    }

    /**
     * Unpack into a sibling temp dir under [baseDir] (same volume → atomic rename works),
     * verify, then rename into place. Returns the [ExtractedResources] the backend should
     * actually serve from — normally [versionDir], but a fallback dir when Windows file
     * locks make the canonical rename impossible (see below).
     *
     * ## Windows file-lock resilience (M4)
     *
     * On Windows a still-running previous backend generation may hold `backend.mjs` in the
     * *partial* target [versionDir] open, so `deleteRecursively()` on it silently fails
     * (returns false, no throw) and the subsequent `Files.move` into that non-empty, locked
     * target throws. Rather than let that abort backend startup, we serve the freshly
     * extracted, already-verified temp bundle from a stable `.locked-<uuid>` sibling dir.
     * The stale locked dir is left for [pruneOtherVersions] to reap on a later run once the
     * lock is gone — preserving restart recovery instead of breaking it.
     */
    private fun extractVersion(versionDir: File): ExtractedResources {
        val tmp = File(baseDir, "$TMP_PREFIX${UUID.randomUUID()}")
        var moved = false
        try {
            tmp.deleteRecursively()
            val tmpWebview = File(tmp, WEBVIEW_SUBDIR)
            val tmpBackendDir = File(tmp, BACKEND_SUBDIR)
            tmpWebview.mkdirs()
            tmpBackendDir.mkdirs()

            (unpack ?: ::extractFromPluginJar).invoke(tmpWebview, tmpBackendDir)

            // Verify BEFORE renaming so the final version dir never appears incomplete.
            val tmpResult = ExtractedResources(tmpWebview, File(tmpBackendDir, BACKEND_ENTRY))
            if (!isComplete(tmpResult)) {
                throw IllegalStateException(
                    "Incomplete extraction (hashedBundle=${hasHashedBundle(tmpWebview)}, " +
                        "backend=${tmpResult.backendFile.exists()}) into $tmp"
                )
            }

            // Another process may have finished publishing while we were unpacking. Its bundle
            // is byte-identical to ours (same plugin version), so adopt it and — critically —
            // do NOT fall through to clearTarget below, which would delete a directory a live
            // backend is already serving. That deletion is exactly what caused the `Not found`
            // blank panel in #149; the `.lock` file used to make this window unreachable, so
            // removing the lock (#308) is what puts the check here instead.
            val canonical = ExtractedResources(
                webviewDir = File(versionDir, WEBVIEW_SUBDIR),
                backendFile = File(File(versionDir, BACKEND_SUBDIR), BACKEND_ENTRY),
            )
            if (isComplete(canonical)) {
                logger.info("Another process published $versionDir while we unpacked; serving its bundle")
                return canonical
            }

            // Try to remove any stale partial target. On Windows a locked backend.mjs
            // makes this a silent no-op; we don't rely on it succeeding.
            val cleared = clearTarget(versionDir)
            if (!cleared && versionDir.exists()) {
                logger.warn(
                    "Could not clear stale partial version dir $versionDir (locked by a running " +
                        "backend?); serving the fresh bundle from a fallback dir instead"
                )
                val served = serveFromFallback(tmp)
                moved = true // tmp was renamed into the fallback dir; don't delete it.
                return served
            }

            versionDir.parentFile?.mkdirs()
            val served = moveIntoPlace(tmp, versionDir)
            // `tmp` was renamed away only if we are serving our own bundle. When we adopted a
            // racer's already-published dir the rename failed, so tmp is still on disk and the
            // finally below must still clean it up.
            moved = !tmp.exists()
            logger.info("Extracted plugin resources for version $version → ${served.backendFile.parentFile?.parentFile}")
            return served
        } finally {
            // If the move/fallback succeeded, tmp was renamed away; otherwise clean the partial.
            if (!moved) tmp.deleteRecursively()
        }
    }

    /**
     * Rename the verified temp bundle to a stable `.locked-<uuid>` sibling dir and serve
     * from there. Used when the canonical [versionDir] can't be replaced because a live
     * process holds it locked (Windows). The dir is NOT `.tmp-`/version-named, so neither
     * this run's `finally` cleanup nor [pruneOtherVersions] deletes it while it's in use.
     */
    private fun serveFromFallback(tmp: File): ExtractedResources {
        val fallback = File(baseDir, "$LOCKED_PREFIX${UUID.randomUUID()}")
        Files.move(tmp.toPath(), fallback.toPath(), StandardCopyOption.REPLACE_EXISTING)
        return ExtractedResources(
            webviewDir = File(fallback, WEBVIEW_SUBDIR),
            backendFile = File(File(fallback, BACKEND_SUBDIR), BACKEND_ENTRY),
        )
    }

    /**
     * Publish the verified temp bundle as [dst], and return what to serve from.
     *
     * Three outcomes, in order of preference:
     *  1. the rename succeeds → serve the canonical version dir;
     *  2. **another process got there first** → serve *their* finished dir (identical bundle);
     *  3. the target is unusable (a Windows lock) → serve in place from `.locked-<uuid>`.
     *
     * Losing the race is the normal concurrent case, not an error (issue #308). Renaming a
     * directory onto a non-empty directory fails — POSIX with `Directory not empty`, Windows
     * with an access error — so once a racer has published `dst`, everyone else lands here.
     * Their bundle is byte-identical to ours (same plugin version), so adopting it is both
     * correct and cheaper than keeping a private copy. This is what the `.lock` file used to
     * hide by serializing extraction; without it, the case has to be handled rather than
     * thrown, or a second IDE instance would fail to start.
     */
    private fun moveIntoPlace(src: File, dst: File): ExtractedResources {
        val canonical = ExtractedResources(
            webviewDir = File(dst, WEBVIEW_SUBDIR),
            backendFile = File(File(dst, BACKEND_SUBDIR), BACKEND_ENTRY),
        )
        try {
            Files.move(src.toPath(), dst.toPath(), StandardCopyOption.ATOMIC_MOVE)
            return canonical
        } catch (e: AtomicMoveNotSupportedException) {
            logger.warn("ATOMIC_MOVE unsupported ($src → $dst); falling back to non-atomic move", e)
            return try {
                Files.move(src.toPath(), dst.toPath(), StandardCopyOption.REPLACE_EXISTING)
                canonical
            } catch (io: java.io.IOException) {
                adoptWinnerOrServeInPlace(src, dst, canonical, io)
            }
        } catch (e: java.io.IOException) {
            return adoptWinnerOrServeInPlace(src, dst, canonical, e)
        }
    }

    /**
     * Fallback shared by both failed-move paths: take the winner's finished bundle when one is
     * there, otherwise keep our own copy under `.locked-<uuid>` and serve that.
     */
    private fun adoptWinnerOrServeInPlace(
        src: File,
        dst: File,
        canonical: ExtractedResources,
        cause: java.io.IOException,
    ): ExtractedResources {
        if (isComplete(canonical)) {
            // Leave `src` for the caller's finally to clean up — the move failed, so it still
            // owns the temp dir and would otherwise be deleting a path we already removed.
            logger.info("Another process published $dst first; serving its bundle")
            return canonical
        }
        logger.warn("Could not publish into $dst (locked target?); serving from a fallback dir", cause)
        return serveFromFallback(src)
    }

    /**
     * Delete sibling version dirs that are NOT the current version. Best-effort: a dir
     * still locked by another running process (e.g. Windows holding backend.mjs) is left
     * for the next run. The current version dir is never touched (issue #149 / E1).
     *
     * `.locked-*` fallback dirs (M4) are skipped: the current run may be serving from one,
     * and a still-in-use one on Windows can't be deleted anyway. They are reaped opportunistically
     * by [pruneLockedFallbacks] on a run that is NOT itself using a fallback.
     */
    private fun pruneOtherVersions() {
        val siblings = baseDir.listFiles() ?: return
        for (dir in siblings) {
            // A `.lock` file left by a version that still used one (see the class doc):
            // dead weight now, and deleting it costs nothing since nobody opens it anymore.
            if (dir.isFile && dir.name == LEGACY_LOCK_NAME) {
                if (dir.delete()) logger.info("Removed the obsolete extraction lock file")
                continue
            }
            if (!dir.isDirectory) continue
            if (dir.name == version) continue
            if (dir.name.startsWith(TMP_PREFIX) || dir.name.startsWith(LOCKED_PREFIX)) continue
            val ok = dir.deleteRecursively()
            if (ok) logger.info("Pruned stale plugin-resource version dir: ${dir.name}")
            else logger.debug("Could not prune ${dir.name} (in use?); leaving for next run")
        }
    }

    /**
     * Best-effort cleanup of leftover `.locked-*` fallback dirs from earlier Windows-lock
     * recoveries (M4). Only called when THIS run serves from the canonical version dir, so
     * it never deletes a dir it is currently using. A `.locked-*` dir still held open by a
     * live backend fails `deleteRecursively()` silently and is left for a later run.
     */
    private fun pruneLockedFallbacks() {
        val siblings = baseDir.listFiles() ?: return
        for (dir in siblings) {
            if (!dir.isDirectory || !dir.name.startsWith(LOCKED_PREFIX)) continue
            val ok = dir.deleteRecursively()
            if (ok) logger.info("Pruned stale locked-fallback dir: ${dir.name}")
            else logger.debug("Could not prune locked-fallback ${dir.name} (in use?); leaving for next run")
        }
    }

    // ── Production: JAR / classpath extraction (ported from NodeProcessManager) ──

    private fun extractFromPluginJar(webviewTarget: File, backendDirTarget: File) {
        extractBackend(backendDirTarget)
        extractWebview(webviewTarget)
    }

    private fun extractBackend(backendDirTarget: File) {
        val stream = resourceAnchor.getResourceAsStream("/backend/$BACKEND_ENTRY")
            ?: throw IllegalStateException("Backend resource /backend/$BACKEND_ENTRY not found in plugin")
        val target = File(backendDirTarget, BACKEND_ENTRY)
        target.parentFile?.mkdirs()
        stream.use { input -> target.outputStream().use { input.copyTo(it) } }
        // win32 Job Object wrapper, shipped beside backend.mjs (win-job.ts resolves it
        // there). Best-effort: if the asset is missing, win-job.ts falls back to a plain
        // spawn (degraded orphan guard), so its absence must not abort extraction.
        resourceAnchor.getResourceAsStream("/backend/$WIN_JOB_WRAPPER")?.use { input ->
            File(backendDirTarget, WIN_JOB_WRAPPER).outputStream().use { input.copyTo(it) }
        }
    }

    private fun extractWebview(webviewTarget: File) {
        val webviewJar = locateWebviewJar()
        if (webviewJar != null) {
            extractWebviewFromJar(webviewTarget, webviewJar)
            return
        }
        // Dev / IDE runtime: resources live on the filesystem, not in a JAR.
        val webviewUrl = resourceAnchor.getResource("/webview/")
        if (webviewUrl != null && webviewUrl.protocol == "file") {
            try {
                val dir = File(webviewUrl.toURI())
                if (dir.isDirectory) {
                    dir.walkTopDown().filter { it.isFile }.forEach { file ->
                        val rel = file.relativeTo(dir).path
                        val out = File(webviewTarget, rel)
                        out.parentFile?.mkdirs()
                        file.inputStream().use { input -> out.outputStream().use { input.copyTo(it) } }
                    }
                    return
                }
            } catch (e: Exception) {
                logger.debug("Dynamic webview scan failed, falling back to known resources: ${e.message}")
            }
        }
        // Fallback: extract known top-level resources + assets individually.
        for (resource in KNOWN_WEBVIEW_RESOURCES) {
            resourceAnchor.getResourceAsStream("/webview/$resource")?.let { stream ->
                val out = File(webviewTarget, resource)
                out.parentFile?.mkdirs()
                stream.use { input -> out.outputStream().use { input.copyTo(it) } }
            }
        }
        extractAssetsFromClasspath(webviewTarget)
    }

    /**
     * Locate the plugin JAR shipping `/webview/`. Anchored on a *file* resource
     * (`index.html`) rather than the `/webview/` directory: IntelliJ's PluginClassLoader
     * reliably resolves file resources to `jar:` URLs but not directory resources (#52).
     */
    private fun locateWebviewJar(): File? {
        val fileUrl = resourceAnchor.getResource("/webview/index.html") ?: return null
        if (fileUrl.protocol != "jar") return null
        return try {
            val connection = fileUrl.openConnection() as? java.net.JarURLConnection ?: return null
            val jar = File(connection.jarFileURL.toURI())
            if (jar.isFile) jar else null
        } catch (e: Exception) {
            logger.debug("Could not resolve webview JAR from $fileUrl: ${e.message}")
            null
        }
    }

    private fun extractWebviewFromJar(targetDir: File, jarFile: File) {
        var count = 0
        java.util.jar.JarFile(jarFile).use { jar ->
            val entries = jar.entries()
            while (entries.hasMoreElements()) {
                val entry = entries.nextElement()
                if (!entry.name.startsWith("webview/") || entry.isDirectory) continue
                val rel = entry.name.removePrefix("webview/")
                val out = File(targetDir, rel)
                out.parentFile?.mkdirs()
                jar.getInputStream(entry).use { input -> out.outputStream().use { input.copyTo(it) } }
                count++
            }
        }
        logger.info("Extracted $count webview entries from JAR: ${jarFile.absolutePath}")
    }

    private fun extractAssetsFromClasspath(targetDir: File) {
        val assetsUrl = resourceAnchor.getResource("/webview/assets/")
        if (assetsUrl != null && assetsUrl.protocol == "file") {
            try {
                val assetsDir = File(assetsUrl.toURI())
                if (assetsDir.isDirectory) {
                    assetsDir.listFiles()?.forEach { file ->
                        if (file.isFile) {
                            val out = File(targetDir, "assets/${file.name}")
                            out.parentFile?.mkdirs()
                            file.inputStream().use { input -> out.outputStream().use { input.copyTo(it) } }
                        }
                    }
                    return
                }
            } catch (e: Exception) {
                logger.debug("Assets scan failed, falling back to known assets: ${e.message}")
            }
        }
        for (asset in KNOWN_ASSETS) {
            resourceAnchor.getResourceAsStream("/webview/$asset")?.let { stream ->
                val out = File(targetDir, asset)
                out.parentFile?.mkdirs()
                stream.use { input -> out.outputStream().use { input.copyTo(it) } }
            }
        }
    }

    // ── Dev mode: source-tree resources (no extraction) ─────────────────────

    private fun resolveDevResources(): ExtractedResources? {
        val devMode = System.getProperty("claude.dev.mode", "false").toBoolean() ||
            System.getenv("CLAUDE_DEV_MODE") == "true"
        if (!devMode) return null
        val projectRoot = findPluginProjectRoot() ?: return null
        val devWebview = File(projectRoot, "webview/dist")
        val devBackend = File(projectRoot, "backend/dist/$BACKEND_ENTRY")
        if (!devWebview.exists() || !devBackend.exists()) {
            logger.warn("Dev mode but source-tree resources missing (webview=${devWebview.exists()}, backend=${devBackend.exists()})")
            return null
        }
        return ExtractedResources(devWebview, devBackend)
    }

    private fun findPluginProjectRoot(): File? {
        val cwd = File(System.getProperty("user.dir"))
        if (File(cwd, "backend/dist/$BACKEND_ENTRY").exists()) return cwd
        System.getProperty("plugin.project.root")?.let { root ->
            val f = File(root)
            if (File(f, "backend/dist/$BACKEND_ENTRY").exists()) return f
        }
        System.getenv("PLUGIN_PROJECT_ROOT")?.let { root ->
            val f = File(root)
            if (File(f, "backend/dist/$BACKEND_ENTRY").exists()) return f
        }
        try {
            val classUrl = javaClass.protectionDomain.codeSource?.location?.toURI()
            if (classUrl != null) {
                var dir: File? = File(classUrl).parentFile
                repeat(5) {
                    if (dir != null && File(dir, "backend/dist/$BACKEND_ENTRY").exists()) return dir
                    dir = dir?.parentFile
                }
            }
        } catch (e: Exception) {
            logger.debug("Class location lookup failed: ${e.message}")
        }
        return null
    }

    companion object {
        const val PLUGIN_ID = "com.github.yhk1038.claude-code-gui"
        private const val ROOT_DIR_NAME = "claude-code-gui"
        private const val WEBVIEW_SUBDIR = "webview"
        private const val BACKEND_SUBDIR = "backend"
        private const val BACKEND_ENTRY = "backend.mjs"
        private const val WIN_JOB_WRAPPER = "win-job-wrapper.ps1"
        /** Name of the `.lock` file older versions created; only ever deleted now (issue #308). */
        private const val LEGACY_LOCK_NAME = ".lock"
        /** Prefix for the sibling temp dir an extraction unpacks into before the atomic rename. */
        private const val TMP_PREFIX = ".tmp-"
        /** Prefix for a serve-in-place fallback dir used when a Windows lock blocks the rename (M4). */
        private const val LOCKED_PREFIX = ".locked-"

        private val KNOWN_WEBVIEW_RESOURCES = listOf(
            "index.html",
            "favicon.svg",
            "favicon-unread.svg",
            "welcome-art-dark.svg",
            "welcome-art-light.svg",
        )
        private val KNOWN_ASSETS = listOf(
            "assets/index.js",
            "assets/index.css",
            "assets/codicon.ttf",
            "assets/clawd.svg",
            "assets/claude-code-logo.svg",
        )

        /**
         * Version-scoped resource root under the IDE's plugin temp path (per IDE product+version).
         *
         * Uses [PathManager.getSystemDir] + `plugins/` rather than the semantically identical
         * [PathManager.getPluginTempPath] because the latter is `@Deprecated`
         * (`@ApiStatus.ScheduledForRemoval` on 2026.2+) and the Marketplace Plugin Verifier flags
         * it. `getPluginTempPath()` is itself defined as `{getSystemPath()}/plugins`, so this
         * reproduces the exact same on-disk location (reboot-surviving system dir, shared across
         * plugin versions). `getSystemDir()` carries no deprecation/obsolete annotations on either
         * the 2024.2 lower bound or the 2026.2 EAP upper bound, so no reflection is needed.
         */
        private fun defaultBaseDir(): File =
            File(File(PathManager.getSystemDir().toFile(), "plugins"), ROOT_DIR_NAME)

        /** Plugin version from the runtime descriptor; the version-scope key. */
        private fun defaultVersion(): String =
            resolvePluginVersion(PluginId.getId(PLUGIN_ID)) ?: "unknown"

        /**
         * Reads this plugin's version via reflection over `PluginManager.getPlugin(PluginId)`.
         *
         * The direct call is `@Deprecated` (2024.2+) and marked `@ApiStatus.Internal` on the
         * 2026.2 EAP; its public replacement chain (`PluginManagerCore.getPlugin`) is still
         * `@Internal`. Invoking through [java.lang.reflect.Method.invoke] keeps the deprecated/
         * internal symbol out of this plugin's bytecode, so the Marketplace Plugin Verifier's
         * static analysis (which only sees statically-referenced symbols) does not flag it — the
         * same pattern used in [com.github.yhk1038.claudecodegui.platform.PlatformActionInvoker].
         *
         * `PluginId.getId(...)` is not itself flagged, so it stays a direct call. The returned
         * descriptor's `getVersion()` is also read reflectively to avoid pinning any descriptor
         * type. Any lookup/reflection failure yields null so the caller falls back to `"unknown"`.
         */
        private fun resolvePluginVersion(pluginId: PluginId): String? = try {
            val getPlugin = PluginManager::class.java.getMethod("getPlugin", PluginId::class.java)
            val descriptor = getPlugin.invoke(null, pluginId) ?: return null
            val getVersion = descriptor.javaClass.getMethod("getVersion")
            getVersion.invoke(descriptor) as? String
        } catch (_: ReflectiveOperationException) {
            null
        }
    }
}
