package com.github.yhk1038.claudecodegui.toolwindow.realization

/**
 * The sequential phases shown in the panel's placeholder label while the JCEF browser
 * is not yet realized. Each phase carries the [key] of its string in the panel loading
 * catalog; resolve it through [PanelLoadingMessages.get] to get text in the user's
 * Interface Language.
 */
enum class LoadingPhase(val key: String) {
    INDEXING_WAIT("phase.indexingWait"),
    BACKEND_START("phase.backendStart"),
    // Fine-grained backend-start sub-phases, emitted from NodeProcessManager.start()
    // so the placeholder reflects real progress instead of a single frozen line while
    // node discovery / shell-PATH capture / resource extraction run (issue #97).
    LOCATING_NODE("phase.locatingNode"),
    PREPARING_BACKEND("phase.preparingBackend"),
    WAITING_FOR_PORT("phase.waitingForPort"),
    ;

    /** Text in the user's Interface Language. Cache-only lookup, safe on the EDT. */
    val message: String get() = PanelLoadingMessages.get(key)
}

/**
 * Catalog keys for the hint that appears when the panel has sat on
 * [LoadingPhase.INDEXING_WAIT] long enough to look broken (issue #464).
 *
 * Two situations reach that point and they need opposite wording. When indexing really
 * is still running, nothing has failed and calling the button "Try again" would be a
 * lie; the user is told large projects take a while and offered a way to skip ahead.
 * When indexing has already finished and the panel is still stuck, the wait itself is
 * the malfunction, so the hint asks about exactly that and the button retries.
 */
object StuckHintKeys {
    const val STILL_INDEXING = "stuck.stillIndexing"
    const val STILL_INDEXING_ACTION = "stuck.stillIndexingAction"
    const val INDEXING_DONE = "stuck.indexingDone"
    const val INDEXING_DONE_ACTION = "stuck.indexingDoneAction"
}
