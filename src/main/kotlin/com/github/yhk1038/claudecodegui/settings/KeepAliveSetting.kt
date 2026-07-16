package com.github.yhk1038.claudecodegui.settings

import com.intellij.ide.util.PropertiesComponent

/**
 * Global "Keep backend running" toggle.
 *
 * ON: every project's backend starts eagerly with the project (no JCEF needed)
 * and its idle shutdown is gated off while the IDE lives — the backend stays
 * reachable for plain-browser clients. OFF: today's lazy-start behaviour with
 * the idle shutdown active.
 *
 * Stored in the application-level [PropertiesComponent] (the [com.github.yhk1038.claudecodegui.hosting.HostModeCache]
 * pattern), NOT in `settings.js`: the value is consumed synchronously by Kotlin
 * before any backend exists (the project-open eager-start decision), and on
 * WSL2 the settings file lives under the Linux home the JVM cannot reliably
 * read. The backend never reads this from disk — Kotlin pushes the state over
 * RPC (SET_KEEP_ALIVE) on every connect and on every toggle.
 *
 * The logic talks to a [Store] abstraction so it is unit-testable with an
 * in-memory fake.
 */
object KeepAliveSetting {

    /** The PropertiesComponent key the toggle is persisted under. */
    private const val KEY = "com.github.yhk1038.claudecodegui.keepBackendRunning"

    /** Minimal persistence backend, so the logic can be tested without the IDE. */
    interface Store {
        fun read(): Boolean
        fun write(value: Boolean)
    }

    /** Production [Store] backed by the application-level [PropertiesComponent]. */
    private object PropertiesComponentStore : Store {
        override fun read(): Boolean = PropertiesComponent.getInstance().getBoolean(KEY, false)
        override fun write(value: Boolean) = PropertiesComponent.getInstance().setValue(KEY, value, false)
    }

    fun get(store: Store): Boolean = store.read()

    fun set(store: Store, value: Boolean) = store.write(value)

    /** Read the toggle from the production PropertiesComponent store. */
    fun get(): Boolean = get(PropertiesComponentStore)

    /**
     * Persist the toggle. Pure storage — side effects (eager start, RPC pushes,
     * widget refresh) live in [com.github.yhk1038.claudecodegui.services.NodeBackendService.applyKeepAlive],
     * the single toggle entry point.
     */
    fun set(value: Boolean) = set(PropertiesComponentStore, value)
}
