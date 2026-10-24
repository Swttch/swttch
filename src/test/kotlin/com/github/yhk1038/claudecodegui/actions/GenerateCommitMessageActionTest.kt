package com.github.yhk1038.claudecodegui.actions

import com.intellij.openapi.vcs.FilePath
import com.intellij.openapi.vcs.changes.Change
import com.intellij.openapi.vcs.changes.ContentRevision
import com.intellij.openapi.vcs.history.VcsRevisionNumber
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.vcs.commit.CommitMessageUi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean
import java.nio.charset.Charset

class GenerateCommitMessageActionTest {

    @Test
    fun `collects paths from selected changes and unversioned files`() {
        val modified = change("/repo/src/modified.kt")
        val deleted = change("/repo/src/deleted.kt", after = false)
        val unversioned = fakeFilePath("/repo/src/new.kt")

        val paths = CommitMessageActionSupport.selectedPaths(
            changes = listOf(modified, deleted),
            unversionedFiles = listOf(unversioned),
        )

        assertEquals(
            listOf("/repo/src/modified.kt", "/repo/src/deleted.kt", "/repo/src/new.kt"),
            paths,
        )
    }

    @Test
    fun `collects file paths from selected changes and unversioned files`() {
        val modified = change("/repo/src/modified.kt")
        val unversioned = fakeFilePath("/repo/src/new.kt")

        val paths = CommitMessageActionSupport.selectedFilePaths(
            changes = listOf(modified),
            unversionedFiles = listOf(unversioned),
        )

        assertEquals(listOf("/repo/src/modified.kt", "/repo/src/new.kt"), paths.map { it.path })
    }

    @Test
    fun `uses one common Git root for the selection`() {
        val file = fakeFilePath("/repo/src/a.kt")

        val root = CommitMessageActionSupport.gitWorkingDir(
            filePaths = listOf(file),
            vcsNameFor = { "Git" },
            rootFor = { "/repo" },
        )

        assertEquals("/repo", root)
    }

    @Test
    fun `uses the IDE project backend for a nested Git root`() {
        val backendRoot = CommitMessageActionSupport.backendProjectRoot(
            projectBasePath = "//wsl.localhost/Ubuntu/home/user/project",
            gitRoot = "//wsl.localhost/Ubuntu/home/user/project/nested-repo",
        )

        assertEquals("//wsl.localhost/Ubuntu/home/user/project", backendRoot)
    }

    @Test
    fun `rejects a Git root outside the IDE project and thin clients`() {
        assertNull(
            CommitMessageActionSupport.backendProjectRoot(
                projectBasePath = "/project",
                gitRoot = "/other/repo",
            ),
        )

        assertFalse(
            CommitMessageActionSupport.canUseCommitMessageBackend(
                projectBasePath = "/project",
                gitRoot = "/project/nested-repo",
                isThinClient = true,
            ),
        )
        assertTrue(
            CommitMessageActionSupport.canUseCommitMessageBackend(
                projectBasePath = "/project",
                gitRoot = "/project/nested-repo",
                isThinClient = false,
            ),
        )
    }

    @Test
    fun `rejects non-Git or multi-root selections`() {
        val file = fakeFilePath("/repo/src/a.kt")
        val otherRoot = fakeFilePath("/other/src/b.kt")

        val svnRoot = CommitMessageActionSupport.gitWorkingDir(
            filePaths = listOf(file),
            vcsNameFor = { "svn" },
            rootFor = { "/repo" },
        )
        assertNull(svnRoot)

        val multiRoot = CommitMessageActionSupport.gitWorkingDir(
            filePaths = listOf(file, otherRoot),
            vcsNameFor = { "git" },
            rootFor = { filePath -> if (filePath === file) "/repo" else "/other" },
        )
        assertNull(multiRoot)
    }

    @Test
    fun `builds commit-message request payload`() {
        val payload = CommitMessageActionSupport.buildPayload(
            workingDir = "/repo",
            selectedPaths = listOf("/repo/src/a.kt", "/repo/src/b.kt"),
        )

        assertEquals(JsonPrimitive("/repo"), payload["workingDir"])
        val selectedPaths = Json.parseToJsonElement(payload.toString())
            .jsonObject["selectedPaths"]!!
            .jsonArray
        assertEquals(
            listOf("/repo/src/a.kt", "/repo/src/b.kt"),
            selectedPaths.map { it.jsonPrimitive.content },
        )
    }

    @Test
    fun `converts only WSL UNC paths in commit-message request payload`() {
        val payload = CommitMessageActionSupport.buildPayload(
            workingDir = "//wsl.localhost/Ubuntu/home/user/repo",
            selectedPaths = listOf(
                "//wsl.localhost/Ubuntu/home/user/repo/src/a.kt",
                "C:/repo/src/b.kt",
            ),
        )

        val obj = Json.parseToJsonElement(payload.toString()).jsonObject

        assertEquals(JsonPrimitive("/home/user/repo"), obj["workingDir"])
        assertEquals(
            listOf("/home/user/repo/src/a.kt", "C:/repo/src/b.kt"),
            obj["selectedPaths"]!!.jsonArray.map { it.jsonPrimitive.content },
        )
    }

    @Test
    fun `parses generated commit message from backend response`() {
        val message = CommitMessageActionSupport.parseCommitMessage(
            """{"commitMessage":"feat: update selected files"}""",
        )

        assertEquals("feat: update selected files", message)
    }

    @Test
    fun `rejects backend response without a string commit message`() {
        assertThrows(IllegalStateException::class.java) {
            CommitMessageActionSupport.parseCommitMessage("""{"error":"failed"}""")
        }
    }

    @Test
    fun `replaces commit-message field content`() {
        val field = FakeCommitMessageUi("old message")

        CommitMessageActionSupport.applyCommitMessage(field, "feat: replace old message")

        assertEquals("feat: replace old message", field.text)
    }

    @Test
    fun `runs action updates on the EDT`() {
        assertEquals(ActionUpdateThread.EDT, GenerateCommitMessageAction().actionUpdateThread)
    }

    @Test
    fun `does not update UI after a disposable is disposed`() {
        val lifetime = CommitMessageUiLifetime()

        assertTrue(CommitMessageActionSupport.canUpdateUi(lifetime))

        Disposer.dispose(lifetime)

        assertTrue(!CommitMessageActionSupport.canUpdateUi(lifetime))
    }

    @Test
    fun `cancels its request when the commit-message lifetime is disposed`() {
        val lifetime = CommitMessageUiLifetime()
        var cancelled = false
        lifetime.onCancel = { cancelled = true }

        Disposer.dispose(lifetime)

        assertTrue(cancelled)
    }

    @Test
    fun `updates UI before finalizing a request`() {
        val lifetime = CommitMessageUiLifetime()
        val events = mutableListOf<String>()

        CommitMessageActionSupport.completeOnUiThread(
            projectDisposed = false,
            lifetime = lifetime,
            updateUi = { events.add("ui") },
            finalize = { events.add("finalize") },
        )

        assertEquals(listOf("ui", "finalize"), events)
    }

    @Test
    fun `finalizes without UI when the project is disposed`() {
        val lifetime = CommitMessageUiLifetime()
        var updatedUi = false

        CommitMessageActionSupport.completeOnUiThread(
            projectDisposed = true,
            lifetime = lifetime,
            updateUi = { updatedUi = true },
            finalize = { Disposer.dispose(lifetime) },
        )

        assertFalse(updatedUi)
        assertTrue(lifetime.isDisposed)
    }

    @Test
    fun `registers action in the Commit Message toolbar`() {
        val pluginDescriptor = File("src/main/resources/META-INF/plugin.xml").readText()
        val actionDescriptor = File("src/main/resources/META-INF/claudecode-vcs-actions.xml").readText()
        val vcsDescriptor = File("src/main/resources/META-INF/claudecode-vcs.xml").readText()

        assertTrue("GenerateCommitMessageAction" in pluginDescriptor)
        assertTrue("""<depends optional="true" config-file="claudecode-vcs-actions.xml">com.intellij.modules.vcs</depends>""" in pluginDescriptor)
        assertTrue("ClaudeCode.GenerateCommitMessage" in actionDescriptor)
        assertTrue("Vcs.MessageActionGroup" in actionDescriptor)
        assertFalse("ClaudeCode.GenerateCommitMessage" in vcsDescriptor)
    }

    @Test
    fun `cancels an attached commit-message request`() {
        val connection = FakeHttpURLConnection()
        val request = CommitMessageHttpRequest()

        request.attach(connection)
        request.cancel()

        assertTrue(request.isCancelled)
        assertTrue(connection.disconnectCalled.get())
    }

    @Test
    fun `cancels a commit-message request before its connection is attached`() {
        val connection = FakeHttpURLConnection()
        val request = CommitMessageHttpRequest()

        request.cancel()
        request.attach(connection)

        assertTrue(request.isCancelled)
        assertTrue(connection.disconnectCalled.get())
    }

    private fun change(path: String, after: Boolean = true): Change {
        val revision = FakeContentRevision(fakeFilePath(path))
        return if (after) Change(null, revision) else Change(revision, null)
    }

    private class FakeContentRevision(private val filePath: FilePath) : ContentRevision {
        override fun getContent(): String? = null
        override fun getFile(): FilePath = filePath
        override fun getRevisionNumber(): VcsRevisionNumber =
            throw UnsupportedOperationException("Not used in test")
    }

    private class FakeCommitMessageUi(initialText: String) : CommitMessageUi {
        private var currentText: String = initialText

        override fun getText(): String = currentText
        override fun setText(text: String?) {
            currentText = text.orEmpty()
        }

        override fun focus() = Unit
        override fun startLoading() = Unit
        override fun stopLoading() = Unit
    }

    private class FakeHttpURLConnection : HttpURLConnection(URI.create("http://127.0.0.1:19836").toURL()) {
        val disconnectCalled = AtomicBoolean(false)

        override fun connect() = Unit
        override fun disconnect() {
            disconnectCalled.set(true)
        }
        override fun usingProxy(): Boolean = false
    }

    private fun fakeFilePath(path: String): FilePath = object : FilePath {
        override fun getVirtualFile() = null
        override fun getVirtualFileParent() = null
        override fun getIOFile(): File = File(path)
        override fun getName(): String = path.substringAfterLast('/')
        override fun getPresentableUrl(): String = path
        override fun getCharset(): Charset = Charsets.UTF_8
        override fun getCharset(project: com.intellij.openapi.project.Project?): Charset = Charsets.UTF_8
        override fun getFileType() = PlainTextFileType.INSTANCE
        override fun getPath(): String = path
        override fun isDirectory(): Boolean = false
        override fun isUnder(path: FilePath, strict: Boolean): Boolean = false
        override fun getParentPath(): FilePath? = null
        override fun isNonLocal(): Boolean = false
    }
}
