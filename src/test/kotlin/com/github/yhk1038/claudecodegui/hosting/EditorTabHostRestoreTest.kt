package com.github.yhk1038.claudecodegui.hosting

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pins the decision at the heart of issue #302: after a restart the editor-tab
 * host must **not** reopen chat tabs itself.
 *
 * The platform persists the whole editor layout — which splitter each tab is in,
 * the orientation, the proportion — and reopens it on the next start. Chat tabs
 * join that restore because they are URL-addressable
 * ([com.github.yhk1038.claudecodegui.editor.ClaudeCodeFileSystem]).
 *
 * Reopening them a second time is what lost the splitter: the plugin's restore
 * ran ~2s later and called `requestOpenFile`, which targets the *active*
 * splitter, not the tab's remembered one. That produced the reported "tab
 * flashes closed, then re-opens in your default tab location".
 *
 * A regression here would be silent — the tabs still appear, just in the wrong
 * pane — so the no-op is asserted by running the method. Any call into the
 * tab-opening path or the persisted state would need a live application and
 * throw; a genuine no-op returns cleanly even with a bogus Project.
 */
class EditorTabHostRestoreTest {

    @Test
    fun `restore is a no-op, so it needs no IDE services at all`() {
        // A Project stand-in that fails loudly if anything is asked of it. The
        // real restore path would call getService(EditorTabStateService) and
        // FileEditorManager.getInstance(project) — both would trip this.
        val hostileProject = java.lang.reflect.Proxy.newProxyInstance(
            com.intellij.openapi.project.Project::class.java.classLoader,
            arrayOf(com.intellij.openapi.project.Project::class.java),
        ) { _, method, _ ->
            throw AssertionError(
                "restorePersistedSessions must leave restore to the IDE, but it called " +
                    "Project.${method.name}(). Reopening editor tabs after the platform already " +
                    "restored them is what lost the splitter placement in issue #302.",
            )
        } as com.intellij.openapi.project.Project

        // Returns cleanly == touched nothing == the IDE's layout restore stands.
        EditorTabHost.restorePersistedSessions(hostileProject)
    }

    @Test
    fun `the tool-window host still restores, since the platform does not reopen its tabs`() {
        // The no-op above is specific to editor tabs. Tool-window content tabs are
        // not files, so nothing else will bring them back and that host must keep
        // its own restore. Guards against "simplifying" both hosts to no-ops.
        val restoreMethod = ToolWindowHost::class.java.declaredMethods
            .filter { it.name == "restorePersistedSessions" }

        assertTrue(restoreMethod.isNotEmpty(), "ToolWindowHost must implement restorePersistedSessions")
        assertEquals(
            1,
            restoreMethod.count { it.parameterCount == 1 },
            "ToolWindowHost should declare exactly one restorePersistedSessions(Project)",
        )
    }
}
