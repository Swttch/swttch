package com.github.yhk1038.claudecodegui.toolwindow.stalled

/**
 * Catalog keys of the stalled-screen guide, in `panelLoading.json` under `stalled`.
 *
 * The guide is drawn by Swing because the webview it stands in for is the thing that did
 * not come up, so its text cannot come from the webview's own i18n.
 *
 * Texts carry `{name}` placeholders that [StalledHelpText] fills in. Nothing here names an
 * IDE menu: the guide's own buttons do what a menu path would have been needed for, so
 * there is no menu name that could differ by the user's IDE language.
 */
object StalledHelpKeys {
    const val TITLE = "stalled.title"
    const val SUBTITLE = "stalled.subtitle"

    /** The title and subtitle when the screen is up but cannot reach the backend. */
    const val DISCONNECTED_TITLE = "stalled.disconnected.title"
    const val DISCONNECTED_SUBTITLE = "stalled.disconnected.subtitle"

    const val RESTART_TITLE = "stalled.restart.title"
    const val RESTART_BODY = "stalled.restart.body"
    const val RESTART_BUTTON = "stalled.restart.button"
    const val RESTART_RUNNING = "stalled.restart.running"

    /** The bold lead of the line under the restart button ("If that does not help,"). */
    const val QUIT_LEAD = "stalled.quit.lead"

    /** The rest of that line ("quit the IDE completely and open it again."). */
    const val QUIT_BODY = "stalled.quit.body"

    const val SETTINGS_TITLE = "stalled.settings.title"
    const val SETTINGS_INTRO = "stalled.settings.intro"
    const val SETTINGS_OPEN_BUTTON = "stalled.settings.openButton"
    const val SETTINGS_COPY_BUTTON = "stalled.settings.copyButton"
    const val SETTINGS_COPIED = "stalled.settings.copied"
    const val SETTINGS_PENDING = "stalled.settings.pending"
    const val SETTINGS_STEP_PASTE_MANY = "stalled.settings.stepPasteMany"
    const val SETTINGS_STEP_PASTE_ONE = "stalled.settings.stepPasteOne"
    const val SETTINGS_STEP_SAVE = "stalled.settings.stepSave"
    const val SETTINGS_PROCESS_TITLE = "stalled.settings.processTitle"
    const val SETTINGS_GPU_TITLE = "stalled.settings.gpuTitle"
    const val SETTINGS_WAYLAND_NOTE = "stalled.settings.waylandNote"

    const val REPORT_COPY_BUTTON = "stalled.report.copyButton"
    const val REPORT_ISSUE_BUTTON = "stalled.report.issueButton"

    /** Tooltip of the "copy the information" link: what the copied text does and does not hold. */
    const val REPORT_HINT = "stalled.report.hint"

    const val CLOSE_BUTTON = "stalled.close.button"

    /** Every key above. The catalog test holds the JSON to exactly this set plus the other keys Kotlin reads. */
    val ALL: Set<String> = setOf(
        TITLE, SUBTITLE, DISCONNECTED_TITLE, DISCONNECTED_SUBTITLE,
        RESTART_TITLE, RESTART_BODY, RESTART_BUTTON, RESTART_RUNNING,
        QUIT_LEAD, QUIT_BODY,
        SETTINGS_TITLE, SETTINGS_INTRO, SETTINGS_OPEN_BUTTON, SETTINGS_COPY_BUTTON, SETTINGS_COPIED,
        SETTINGS_PENDING, SETTINGS_STEP_PASTE_MANY, SETTINGS_STEP_PASTE_ONE, SETTINGS_STEP_SAVE,
        SETTINGS_PROCESS_TITLE, SETTINGS_GPU_TITLE, SETTINGS_WAYLAND_NOTE,
        REPORT_COPY_BUTTON, REPORT_ISSUE_BUTTON, REPORT_HINT,
        CLOSE_BUTTON,
    )
}
