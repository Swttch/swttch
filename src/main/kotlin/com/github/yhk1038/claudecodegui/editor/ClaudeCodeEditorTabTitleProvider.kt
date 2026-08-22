package com.github.yhk1038.claudecodegui.editor

import com.intellij.openapi.fileEditor.impl.EditorTabTitleProvider
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Labels a chat tab with its conversation name, so the platform never falls back
 * to disambiguating our tabs by their UUID path.
 *
 * `EditorTabPresentationUtil.getEditorTabTitle` resolves a label in three steps:
 *
 *  1. the `editorTabTitleProvider` extensions — this class;
 *  2. the platform's unique-name pass, for when two open tabs share a name;
 *  3. `VirtualFile.getPresentableName`.
 *
 * Step 3 is what we want, but step 2 got there first. Every fresh chat tab is
 * named "Claude Code" until its conversation reports a title, so opening a
 * second one with "+" made two open tabs share a name — and the unique-name pass
 * builds its labels out of `VirtualFile.getPath()` (via `UniqueVFilePathBuilder`,
 * the same machinery that turns two `Main.kt` into `foo/Main.kt` and
 * `bar/Main.kt`). Ours is the tab's UUID, deliberately: a stable path is what
 * makes the persisted `claude-code://<tabId>` URL survive a restart (issue #302).
 * So both tabs came back labelled `43871f9c-1e0e-4176-8355-f8df1c09b1c7`.
 *
 * Claiming step 1 for our own files stops the platform before it ever reaches
 * step 2. Two untitled tabs both reading "Claude Code" is the intended
 * presentation, the same as two untitled chats in Cursor — a chat tab has no
 * containing directory to disambiguate it with, and its UUID means nothing to
 * the user.
 *
 * Every other file answers null, which leaves the platform's own resolution —
 * unique-name pass included — exactly as it was.
 */
class ClaudeCodeEditorTabTitleProvider : EditorTabTitleProvider {

    override fun getEditorTabTitle(project: Project, file: VirtualFile): String? = titleFor(file)

    companion object {
        /**
         * The label for [file], or null if it is not one of ours.
         *
         * Split out from the extension method because the platform signature
         * demands a [Project] this resolution never consults — a chat tab's label
         * is a property of the tab alone — and a plain unit test cannot supply one.
         */
        fun titleFor(file: VirtualFile): String? = (file as? ClaudeCodeVirtualFile)?.presentableName
    }
}
