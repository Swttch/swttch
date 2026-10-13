package com.github.yhk1038.claudecodegui.platform

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vfs.VirtualFile
import java.lang.reflect.Method

/**
 * Opens a file in the editor without blocking the EDT, across the IDE major
 * versions this plugin supports.
 *
 * Why this exists:
 *   FileEditorManager.requestOpenFile(VirtualFile) is the non-blocking open (see
 *   [com.github.yhk1038.claudecodegui.hosting.EditorTabHost]). A direct call is
 *   compiled into a method reference that includes the return type, and the
 *   Marketplace verifier reported that reference as unresolved on IntelliJ IDEA
 *   2026.3 (263) — `NoSuchMethodError` at runtime.
 *
 * Reflection looks the method up by name and parameter types only, so it does not
 * pin a return type into this plugin's bytecode. The result is discarded, so the
 * return type never has to be known. The same approach keeps deprecated symbols
 * out of the verifier's sight in [PlatformActionInvoker].
 */
object EditorOpener {
    private val logger = Logger.getInstance(EditorOpener::class.java)

    private val requestOpenFileMethod: Method? by lazy {
        findRequestOpenFile(FileEditorManager::class.java).also {
            if (it == null) logger.warn("FileEditorManager.requestOpenFile(VirtualFile) is absent in this IDE version")
        }
    }

    internal fun findRequestOpenFile(managerClass: Class<*>): Method? =
        try {
            managerClass.getMethod("requestOpenFile", VirtualFile::class.java)
        } catch (_: NoSuchMethodException) {
            null
        }

    /**
     * Opens [file], or focuses it when it is already open. Must run on the EDT.
     * Returns false when the platform offers no such method or the call failed.
     */
    fun requestOpenFile(manager: FileEditorManager, file: VirtualFile): Boolean {
        val method = requestOpenFileMethod ?: return false
        return try {
            method.invoke(manager, file)
            true
        } catch (e: ReflectiveOperationException) {
            logger.warn("FileEditorManager.requestOpenFile failed for ${file.name}", e)
            false
        }
    }
}
