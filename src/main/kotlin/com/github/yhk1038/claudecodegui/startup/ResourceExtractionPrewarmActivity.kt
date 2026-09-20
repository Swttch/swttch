package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.hosting.ThinClient
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.ide.AppLifecycleListener

/**
 * Prewarms plugin resource extraction as early in the app lifecycle as is safe.
 *
 * The plugin's webview/backend resources are extracted from the JAR once per
 * (IDE product, plugin version) by [NodeBackendService]. Kicking that off here means an
 * IDE restart — which the plugin already requires after an update — is the natural moment
 * the extraction happens, so by the time a panel opens the shared extraction gate is
 * usually already complete and backend start doesn't wait on disk IO. See issue #149.
 *
 * This is only a prewarm: the gate is LAZY and self-heals on first use, so extraction
 * still runs correctly even when this listener doesn't (e.g. a dynamic plugin reload).
 *
 * ## Why AppLifecycleListener, not ApplicationInitializedListener
 *
 * `ApplicationInitializedListener.execute(CoroutineScope)` puts `kotlinx.coroutines.
 * CoroutineScope` on the plugin↔platform classloader boundary. The plugin loads coroutines
 * through its own PluginClassLoader while the platform loaded them through its PathClassLoader,
 * so overriding that method fails at class-load time with a `LinkageError` (loader constraint
 * violation) and the whole plugin fails to load. [AppLifecycleListener.appFrameCreated] is
 * non-`@Internal` and exposes no coroutine types, so it sidesteps the constraint entirely.
 * [NodeBackendService.prewarmResources] only starts a LAZY Deferred (non-blocking), so this
 * runs safely on the EDT.
 */
class ResourceExtractionPrewarmActivity : AppLifecycleListener {
    override fun appFrameCreated(commandLineArgs: MutableList<String>) {
        // Nothing to prewarm on the JetBrains Client half of Remote Development:
        // the resources being unpacked are the backend and its webview, and this
        // machine never starts either. Extracting them anyway wrote hundreds of
        // files into the user's cache that nothing would ever read (issue #292).
        if (ThinClient.isThinClient()) return
        NodeBackendService.getInstance().prewarmResources()
    }
}
