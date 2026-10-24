package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.bridge.NoopRpcHandler
import com.github.yhk1038.claudecodegui.bridge.WslPathResolver
import com.github.yhk1038.claudecodegui.hosting.ThinClient
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.icons.AllIcons
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.util.Key
import com.intellij.openapi.vcs.FilePath
import com.intellij.openapi.vcs.VcsDataKeys
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.openapi.vcs.changes.Change
import com.intellij.vcs.commit.CommitMessageUi
import com.intellij.vcs.commit.CommitWorkflowUi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.atomic.AtomicBoolean

internal class CommitMessageUiLifetime : Disposable {
    var isDisposed = false
        private set
    var onCancel: (() -> Unit)? = null

    override fun dispose() {
        onCancel?.invoke()
        isDisposed = true
    }
}

internal object CommitMessageActionSupport {
    private const val GIT_VCS_NAME = "git"

    fun selectedFilePaths(
        changes: Iterable<Change>,
        unversionedFiles: Iterable<FilePath>,
    ): List<FilePath> = sequence {
        for (change in changes) {
            val revision = change.afterRevision ?: change.beforeRevision
            yield(revision?.file)
        }
        for (file in unversionedFiles) yield(file)
    }
        .filterNotNull()
        .filter { it.path.isNotBlank() }
        .distinctBy { it.path }
        .toList()

    fun selectedPaths(
        changes: Iterable<Change>,
        unversionedFiles: Iterable<FilePath>,
    ): List<String> = selectedFilePaths(changes, unversionedFiles).map { it.path }

    fun gitWorkingDir(
        filePaths: Iterable<FilePath>,
        vcsNameFor: (FilePath) -> String?,
        rootFor: (FilePath) -> String?,
    ): String? {
        val roots = mutableSetOf<String>()
        for (filePath in filePaths) {
            if (!vcsNameFor(filePath).equals(GIT_VCS_NAME, ignoreCase = true)) return null
            val root = rootFor(filePath) ?: return null
            roots.add(root)
        }
        return roots.singleOrNull()
    }

    private fun backendPath(path: String): String =
        if (WslPathResolver.isWslUncPath(path)) WslPathResolver.toWslPath(path) ?: path else path

    private fun comparablePath(path: String): String =
        backendPath(path).replace('\\', '/').trimEnd('/')

    fun backendProjectRoot(projectBasePath: String?, gitRoot: String?): String? {
        if (projectBasePath.isNullOrBlank() || gitRoot.isNullOrBlank()) return null
        val projectRoot = comparablePath(projectBasePath)
        val root = comparablePath(gitRoot)
        return if (root == projectRoot || root.startsWith("$projectRoot/")) projectBasePath else null
    }

    fun canUseCommitMessageBackend(
        projectBasePath: String?,
        gitRoot: String?,
        isThinClient: Boolean = ThinClient.isThinClient(),
    ): Boolean = !isThinClient && backendProjectRoot(projectBasePath, gitRoot) != null

    fun buildPayload(workingDir: String, selectedPaths: List<String>) = buildJsonObject {
        put("workingDir", backendPath(workingDir))
        putJsonArray("selectedPaths") {
            selectedPaths.forEach { add(backendPath(it)) }
        }
    }

    fun parseCommitMessage(response: String): String {
        val message = Json.parseToJsonElement(response)
            .jsonObject["commitMessage"]
            ?.jsonPrimitive
            ?.contentOrNull
        if (message.isNullOrBlank()) error("Backend response has no commitMessage")
        return message
    }

    fun applyCommitMessage(field: CommitMessageUi, message: String) {
        field.setText(message)
        field.focus()
    }

    fun canUpdateUi(lifetime: CommitMessageUiLifetime): Boolean = !lifetime.isDisposed

    fun completeOnUiThread(
        projectDisposed: Boolean,
        lifetime: CommitMessageUiLifetime,
        updateUi: () -> Unit,
        finalize: () -> Unit,
    ) {
        if (!projectDisposed && canUpdateUi(lifetime)) updateUi()
        if (!lifetime.isDisposed) Disposer.dispose(lifetime)
        finalize()
    }
}

internal class CommitMessageHttpRequest {
    private val cancelled = AtomicBoolean(false)

    @Volatile
    private var connection: HttpURLConnection? = null

    val isCancelled: Boolean
        get() = cancelled.get()

    fun attach(connection: HttpURLConnection) {
        this.connection = connection
        if (cancelled.get()) connection.disconnect()
    }

    fun cancel() {
        cancelled.set(true)
        connection?.disconnect()
    }
}

private val CLAUDE_ACTION_ICON = IconLoader.getIcon("/icons/claudeCode.svg", GenerateCommitMessageAction::class.java)
private val ACTIVE_COMMIT_MESSAGE_REQUEST = Key.create<CommitMessageHttpRequest>("claudeCode.activeCommitMessageRequest")

class GenerateCommitMessageAction : AnAction() {
    private val logger = Logger.getInstance(GenerateCommitMessageAction::class.java)

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        project.getUserData(ACTIVE_COMMIT_MESSAGE_REQUEST)?.let { current ->
            current.cancel()
            return
        }
        // Qoder reads the selected changes through the handler's UI, not through
        // COMMIT_WORKFLOW_UI. The concrete handler class is platform-internal to
        // older compile targets, so bridge the public getUi() reflectively.
        val handler = e.getData(VcsDataKeys.COMMIT_WORKFLOW_HANDLER)
        val workflow = commitWorkflowUi(handler)
            ?: e.getData(VcsDataKeys.COMMIT_WORKFLOW_UI)
        val field = e.getData(VcsDataKeys.COMMIT_MESSAGE_CONTROL) as? CommitMessageUi
            ?: workflow?.commitMessageUi
        if (workflow == null || field == null) {
            logger.info(
                "Generate commit message rejected: workflow missing or field missing; " +
                    "handler=${handler?.javaClass?.name}, workflow=${workflow?.javaClass?.name}, " +
                    "field=${field?.javaClass?.name}",
            )
            notifyNoEligibleSelection(project)
            return
        }
        val includedChanges = workflow.getIncludedChanges()
        val includedUnversionedFiles = workflow.getIncludedUnversionedFiles()
        val selectedFilePaths = CommitMessageActionSupport.selectedFilePaths(
            changes = includedChanges,
            unversionedFiles = includedUnversionedFiles,
        )
        if (selectedFilePaths.isEmpty()) {
            logger.info(
                "Generate commit message rejected: no eligible paths; " +
                    "includedChanges=${includedChanges.size}, " +
                    "includedUnversionedFiles=${includedUnversionedFiles.size}",
            )
            notifyNoEligibleSelection(project)
            return
        }
        val vcsManager = ProjectLevelVcsManager.getInstance(project)
        val workingDir = CommitMessageActionSupport.gitWorkingDir(
            filePaths = selectedFilePaths,
            vcsNameFor = { vcsManager.getVcsFor(it)?.name },
            rootFor = { vcsManager.getVcsRootFor(it)?.path },
        ) ?: run {
            logger.info(
                "Generate commit message rejected: no single Git working dir; " +
                        "selectedPathCount=${selectedFilePaths.size}, " +
                        "distinctVcsNames=${selectedFilePaths.map { vcsManager.getVcsFor(it)?.name }.toSet()}, " +
                        "distinctRoots=${selectedFilePaths.map { vcsManager.getVcsRootFor(it)?.path }.toSet()}",
            )
            notifyNoEligibleSelection(project)
            return
        }
        val projectBasePath = project.basePath
        if (!CommitMessageActionSupport.canUseCommitMessageBackend(projectBasePath, workingDir)) {
            logger.info(
                "Generate commit message rejected: backend unavailable; " +
                    "projectBasePath=$projectBasePath, workingDir=$workingDir, " +
                    "thinClient=${ThinClient.isThinClient()}",
            )
            notifyNoEligibleSelection(project)
            return
        }
        val selectedPaths = selectedFilePaths.map { it.path }
        val backendProjectRoot = CommitMessageActionSupport.backendProjectRoot(projectBasePath, workingDir)
            ?: run {
                logger.info(
                    "Generate commit message rejected: backend project root missing; " +
                        "projectBasePath=$projectBasePath, workingDir=$workingDir",
                )
                notifyNoEligibleSelection(project)
                return
            }
        logger.info(
            "Generate commit message accepted; selectedPathCount=${selectedPaths.size}, " +
                "workingDir=$workingDir, backendProjectRoot=$backendProjectRoot",
        )

        val payload = CommitMessageActionSupport.buildPayload(workingDir, selectedPaths)
        val backend = NodeBackendService.getInstance()
        val transientPanelId = "commit-message-${System.nanoTime()}"
        val uiLifetime = CommitMessageUiLifetime()
        val request = CommitMessageHttpRequest()
        uiLifetime.onCancel = request::cancel
        project.putUserData(ACTIVE_COMMIT_MESSAGE_REQUEST, request)
        Disposer.register(workflow, uiLifetime)
        backend.ensureStarted(backendProjectRoot, transientPanelId, NoopRpcHandler)
        field.startLoading()
        e.presentation.text = "Stop"

        CoroutineScope(Dispatchers.IO).launch {
            val presentation = e.presentation
            fun completeOnUiThread(updateUi: () -> Unit) {
                ApplicationManager.getApplication().invokeLater {
                    if (!project.isDisposed) project.putUserData(ACTIVE_COMMIT_MESSAGE_REQUEST, null)
                    presentation.text = "Generate Commit Message"
                    CommitMessageActionSupport.completeOnUiThread(
                        projectDisposed = project.isDisposed,
                        lifetime = uiLifetime,
                        updateUi = updateUi,
                        finalize = { backend.releasePanel(backendProjectRoot, transientPanelId) },
                    )
                }
            }

            try {
                val port = backend.awaitPort(backendProjectRoot)
                val response = postJson(
                    port,
                    "/internal/commit-message",
                    payload.toString(),
                    backend.authToken(backendProjectRoot),
                    request,
                )
                val message = CommitMessageActionSupport.parseCommitMessage(response)
                completeOnUiThread {
                    if (!request.isCancelled) {
                        CommitMessageActionSupport.applyCommitMessage(field, message)
                    }
                    field.stopLoading()
                }
            } catch (ex: Exception) {
                logger.warn("Failed to generate commit message", ex)
                completeOnUiThread {
                    if (!request.isCancelled) notifyGenerationFailed(project, ex)
                    field.stopLoading()
                }
            }
        }
    }

    override fun update(e: AnActionEvent) {
        // Match Qoder: stay visible and let the action report an empty selection.
        e.presentation.isVisible = e.project != null
        e.presentation.isEnabled = true
        val isGenerating = e.project?.getUserData(ACTIVE_COMMIT_MESSAGE_REQUEST) != null
        e.presentation.text = if (isGenerating) "Stop" else "Generate Commit Message"
        e.presentation.icon = if (isGenerating) AllIcons.Actions.Suspend else CLAUDE_ACTION_ICON
    }

    private fun notifyNoEligibleSelection(project: Project) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("claude-code-gui.attention")
            .createNotification(
                "Claude Code",
                "No file changes, or the selected files are not eligible",
                NotificationType.WARNING,
            )
            .notify(project)
    }

    private fun notifyGenerationFailed(project: Project, cause: Exception) {
        val detail = cause.message?.takeIf { it.isNotBlank() } ?: "Unknown error"
        NotificationGroupManager.getInstance()
            .getNotificationGroup("claude-code-gui.attention")
            .createNotification(
                "Claude Code",
                "Failed to generate commit message: $detail",
                NotificationType.ERROR,
            )
            .notify(project)
    }

    private fun commitWorkflowUi(handler: Any?): CommitWorkflowUi? {
        if (handler == null) return null
        return runCatching {
            handler.javaClass.getMethod("getUi").invoke(handler) as? CommitWorkflowUi
        }.onFailure {
            logger.warn("Failed to read commit workflow UI from handler ${handler.javaClass.name}", it)
        }.getOrNull()
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    private fun postJson(
        port: Int,
        path: String,
        payload: String,
        authToken: String?,
        request: CommitMessageHttpRequest,
    ): String {
        val conn = URI("http://127.0.0.1:$port$path").toURL()
            .openConnection() as HttpURLConnection
        request.attach(conn)
        if (request.isCancelled) throw IllegalStateException("Commit message generation cancelled")
        try {
            conn.connectTimeout = 2_000
            conn.readTimeout = 120_000
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            if (!authToken.isNullOrEmpty()) conn.setRequestProperty("x-ccg-token", authToken)
            conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            if (code !in 200..299) error("POST $path returned HTTP $code")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } catch (ex: Exception) {
            if (request.isCancelled) throw IllegalStateException("Commit message generation cancelled", ex)
            throw ex
        } finally {
            conn.disconnect()
        }
    }
}
