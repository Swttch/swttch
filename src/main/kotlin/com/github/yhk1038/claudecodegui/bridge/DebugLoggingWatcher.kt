package com.github.yhk1038.claudecodegui.bridge

import com.intellij.util.concurrency.AppExecutorUtil
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Tells the backend when the IDE's debug-log switch moves by itself (issue #723).
 *
 * The user can change the switch in the IDE's Debug Log Settings, and the IDE announces nothing when
 * a logger's level changes. So while someone is listening, the switch is read every few seconds and
 * a change is passed on. A change this plugin made itself is recorded through [apply], so it does
 * not come back as a "change".
 */
object DebugLoggingWatcher {

    private const val POLL_INTERVAL_SECONDS = 3L

    private val listeners = CopyOnWriteArrayList<(Boolean) -> Unit>()
    private var task: ScheduledFuture<*>? = null

    @Volatile
    private var lastKnown: Boolean = DebugLoggingSwitch.plugin.isEnabled()

    /** Set the switch on behalf of the setting, and remember it as the known state. */
    fun apply(enabled: Boolean) {
        DebugLoggingSwitch.plugin.setEnabled(enabled)
        lastKnown = enabled
    }

    /** The switch as it stands in the IDE now. */
    fun isEnabled(): Boolean = DebugLoggingSwitch.plugin.isEnabled()

    @Synchronized
    fun addListener(listener: (Boolean) -> Unit) {
        listeners.add(listener)
        if (task == null) {
            task = AppExecutorUtil.getAppScheduledExecutorService().scheduleWithFixedDelay(
                ::poll, POLL_INTERVAL_SECONDS, POLL_INTERVAL_SECONDS, TimeUnit.SECONDS,
            )
        }
    }

    @Synchronized
    fun removeListener(listener: (Boolean) -> Unit) {
        listeners.remove(listener)
        if (listeners.isEmpty()) {
            task?.cancel(false)
            task = null
        }
    }

    private fun poll() {
        val now = DebugLoggingSwitch.plugin.isEnabled()
        if (now == lastKnown) return
        lastKnown = now
        for (listener in listeners) listener(now)
    }
}
