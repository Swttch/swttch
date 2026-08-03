package com.github.yhk1038.claudecodegui.settings

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.dsl.builder.*
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import javax.swing.JComponent

class ClaudeCodeSettingsConfigurable : Configurable {

    private var panel: DialogPanel? = null
    private val settings = SettingsManager.getInstance()

    // UI 바인딩용 임시 변수
    private var cliPath: String = ""
    private var nodePath: String = ""

    override fun getDisplayName(): String = "Claude Code"

    override fun createComponent(): JComponent {
        // 현재 설정값 로드
        cliPath = settings.get("cliPath")?.jsonPrimitive?.contentOrNull ?: ""
        nodePath = settings.get("nodePath")?.jsonPrimitive?.contentOrNull ?: ""

        panel = panel {
            group("CLI Configuration") {
                row("CLI Path:") {
                    textField()
                        .bindText(::cliPath)
                        .columns(COLUMNS_LARGE)
                        .comment("Path to Claude Code CLI. Leave empty for auto-detection.")
                }
                row("Node Path:") {
                    textField()
                        .bindText(::nodePath)
                        .columns(COLUMNS_LARGE)
                        .comment("Path to the Node.js executable that runs the backend. Leave empty for auto-detection. Restart required after change.")
                }
            }
        }
        return panel!!
    }

    override fun isModified(): Boolean = panel?.isModified() ?: false

    override fun apply() {
        panel?.apply()
        settings.setAll(mapOf(
            "cliPath" to if (cliPath.isBlank()) JsonNull else JsonPrimitive(cliPath),
            "nodePath" to if (nodePath.isBlank()) JsonNull else JsonPrimitive(nodePath)
        ))
    }

    override fun reset() {
        cliPath = settings.get("cliPath")?.jsonPrimitive?.contentOrNull ?: ""
        nodePath = settings.get("nodePath")?.jsonPrimitive?.contentOrNull ?: ""
        panel?.reset()
    }
}
