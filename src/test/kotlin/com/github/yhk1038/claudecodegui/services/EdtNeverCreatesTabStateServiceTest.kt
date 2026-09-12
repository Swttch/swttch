package com.github.yhk1038.claudecodegui.services

import com.intellij.openapi.project.Project
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy

/**
 * Pins that the EDT never creates [EditorTabStateService] (issue #438).
 *
 * [EditorTabStateService] is a `PersistentStateComponent`, so *creating* it makes
 * the platform read `claudeCodeEditorTabs.xml`, which expands path macros, which
 * asks the Maven plugin for the local repository, which blocks on EEL when the
 * project is not on a local file system. Blocking is forbidden on the EDT, so a
 * user whose project lived in WSL got `IllegalStateException: This method is
 * forbidden on EDT` every time a chat tab was restored.
 *
 * The whole chain is inside the platform and `getService(...)` reads like any
 * other lookup, so nothing at the call site looks wrong. That is what makes this
 * worth pinning: a regression here is invisible to review, invisible on macOS,
 * and only shows up on someone else's WSL machine.
 */
class EdtNeverCreatesTabStateServiceTest {

    /**
     * A Project stand-in that fails the test if anyone asks it to *create* the
     * service.
     *
     * `getService` creates, `getServiceIfCreated` does not, so answering the two
     * differently is what lets these tests tell the safe lookup from the crashing
     * one.
     */
    private fun fakeProject(
        alreadyCreated: EditorTabStateService?,
        disposed: Boolean = false,
    ): Project =
        Proxy.newProxyInstance(
            Project::class.java.classLoader,
            arrayOf(Project::class.java),
        ) { proxy, method, args ->
            when (method.name) {
                "getServiceIfCreated" -> alreadyCreated
                "getService" -> throw AssertionError(
                    "asked Project.getService(), which CREATES the service on the calling " +
                        "thread. On the EDT that reads claudeCodeEditorTabs.xml and crashes on a " +
                        "WSL project (issue #438). Use EditorTabStateService.useFromEdt() instead.",
                )
                "isDisposed" -> disposed
                "hashCode" -> System.identityHashCode(proxy)
                "equals" -> proxy === args?.getOrNull(0)
                "toString" -> "fake-project"
                else -> throw AssertionError("unexpected Project.${method.name}()")
            }
        } as Project

    @Test
    fun `runs straight away on the calling thread when the service already exists`() {
        val service = EditorTabStateService().apply { addTab("tab-1") }

        var received: EditorTabStateService? = null
        var deferred = false
        EditorTabStateService.useFromEdt(
            fakeProject(alreadyCreated = service),
            runOffTheEdt = { deferred = true },
        ) { received = it }

        assertSame(service, received)
        assertFalse(deferred, "nothing needs deferring when the service is already there")
    }

    @Test
    fun `defers to a background thread when the service does not exist yet`() {
        var deferredWork: Runnable? = null
        var ran = false

        // The fake project throws on getService, so this call returning normally is
        // itself the assertion: the creation was handed off, not done right here.
        EditorTabStateService.useFromEdt(
            fakeProject(alreadyCreated = null),
            runOffTheEdt = { deferredWork = it },
        ) { ran = true }

        assertNotNull(deferredWork, "the creation must move off the EDT, not be skipped")
        assertFalse(ran, "the body must not run until the service has been created")
    }

    @Test
    fun `a disposed project drops the deferred work instead of creating the service`() {
        var deferredWork: Runnable? = null
        var ran = false

        EditorTabStateService.useFromEdt(
            fakeProject(alreadyCreated = null, disposed = true),
            runOffTheEdt = { deferredWork = it },
        ) { ran = true }

        // Running the deferred work must be safe: by then the project is gone, and
        // asking a disposed project for a service is what would throw here (the fake
        // fails the test on getService, which stands in for that).
        deferredWork?.run()
        assertFalse(ran, "the body must not run for a project that is already gone")
    }

    @Test
    fun `getInstanceIfCreated never creates the service`() {
        // Guards the accessor itself, so the tests above cannot be satisfied by an
        // accessor that quietly falls back to the creating lookup.
        assertNull(EditorTabStateService.getInstanceIfCreated(fakeProject(alreadyCreated = null)))

        val service = EditorTabStateService()
        assertSame(service, EditorTabStateService.getInstanceIfCreated(fakeProject(service)))
    }

    @Test
    fun `the deferred body still sees the state it would have seen right away`() {
        // Arriving late must not mean arriving empty: whatever the body reads has to
        // be the same state, or "restore" quietly turns into "open a blank tab".
        val service = EditorTabStateService().apply {
            addTab("tab-1")
            updatePath("tab-1", "/sessions/conv-1")
        }

        var seenPath: String? = null
        EditorTabStateService.useFromEdt(fakeProject(alreadyCreated = service)) { state ->
            seenPath = state.getPath("tab-1")
        }

        assertEquals("/sessions/conv-1", seenPath)
        assertTrue(service.getOpenTabIds().contains("tab-1"))
    }
}
