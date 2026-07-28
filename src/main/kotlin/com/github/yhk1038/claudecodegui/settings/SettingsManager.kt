package com.github.yhk1038.claudecodegui.settings

import com.github.yhk1038.claudecodegui.hosting.HostMode
import com.github.yhk1038.claudecodegui.hosting.HostModeCache
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import kotlinx.serialization.json.*
import java.io.File
import java.nio.file.Path

/**
 * 파일 기반 설정 관리자.
 * `~/.claude-code-gui/settings.js` 파일을 읽기/쓰기/캐싱한다.
 *
 * 스레드 안전성: 모든 public 메서드는 전용 lock 객체로 동기화된다.
 * ConcurrentHashMap 대신 synchronized(lock)을 사용하는 이유: 복합 원자성(read-parse-populate, modify-serialize-write)이 필요하기 때문.
 */
@Service(Service.Level.APP)
class SettingsManager {

    private val logger = Logger.getInstance(SettingsManager::class.java)

    /** 스레드 안전을 위한 전용 잠금 객체 */
    private val lock = Any()

    /** 설정 파일 경로 */
    private val settingsDir: Path = Path.of(System.getProperty("user.home"), ".claude-code-gui")
    private val settingsFile: File = settingsDir.resolve("settings.js").toFile()

    /** 인메모리 캐시 */
    private var cachedSettings: MutableMap<String, JsonElement> = mutableMapOf()
    private var lastModified: Long = 0L
    private var isLoaded: Boolean = false

    /** 한글 주석 맵 (파일 생성 시 사용) */
    private val commentMap: LinkedHashMap<String, String> = linkedMapOf(
        "cliPath" to "Claude CLI 실행 파일 경로 (null이면 자동 감지)",
        "nodePath" to "Node.js 실행 파일 경로 (null이면 자동 감지, 변경 시 재시작 필요)",
        "theme" to """테마: "system" | "light" | "dark"""",
        "fontSize" to "글꼴 크기 (8~32)",
        "lineHeight" to "채팅 메시지 줄 간격(line-height 배수, 0.5~10)",
        "debugMode" to "디버그 모드 활성화",
        "logLevel" to """로그 레벨: "debug" | "info" | "warn" | "error"""",
        "terminalApp" to """터미널 프로그램 (null이면 OS 기본 터미널)""",
        "hostMode" to """채팅을 띄우는 자리: "editor-tab" | "tool-window""""
    )

    /** 기본값 맵 (순서 보존) */
    private val defaults: LinkedHashMap<String, JsonElement> get() = LinkedHashMap(DEFAULTS)

    /**
     * 설정 파일이 없으면 기본값으로 생성하고, 설정을 로드한다.
     * [ClaudeCodePanel]의 init 블록에서 호출. 동기 실행.
     *
     * **EDT 동기 실행 허용 근거:**
     * - 기존 init에서 이미 `isViteDevServerRunning()` (500ms 소켓 타임아웃) 수행
     * - 설정 파일 <1KB, APFS/ext4에서 <1ms 읽기
     * - JetBrains `PersistentStateComponent.loadState()`도 EDT 동기 실행
     *
     * @return 로드 성공 여부
     */
    fun ensureAndLoad(): Boolean = synchronized(lock) {
        try {
            val dir = settingsDir.toFile()
            if (!dir.exists()) {
                dir.mkdirs()
            }
            if (!settingsFile.exists()) {
                val content = JsSettingsParser.generate(defaults, commentMap)
                settingsFile.writeText(content)
                logger.info("Created default settings file: ${settingsFile.absolutePath}")
            }
            return@synchronized loadInternal()
        } catch (e: Exception) {
            logger.error("Failed to ensure and load settings", e)
            return@synchronized false
        }
    }

    /**
     * 설정 파일을 읽어 인메모리 캐시에 로드한다.
     * lastModified가 변경된 경우에만 디스크에서 다시 읽는다.
     * @return 로드 성공 여부
     */
    fun load(): Boolean = synchronized(lock) {
        loadInternal()
    }

    /**
     * 현재 캐시를 파일에 저장한다.
     * @return 저장 성공 여부
     */
    fun save(): Boolean = synchronized(lock) {
        saveInternal(emptyMap())
    }

    /**
     * 특정 설정 값 조회. 캐시에서 읽되, lastModified를 확인하여 필요 시 reload.
     * @param key 설정 키
     * @return 설정 값 (없으면 null)
     */
    fun get(key: String): JsonElement? = synchronized(lock) {
        refreshIfNeededInternal()
        cachedSettings[key]
    }

    /**
     * 특정 설정 값 변경. 캐시를 업데이트하고 파일에 저장한다.
     * @param key 설정 키
     * @param value 새 값
     * @return 저장 성공 여부
     */
    fun set(key: String, value: JsonElement): Boolean = synchronized(lock) {
        saveInternal(mapOf(key to value))
    }

    /**
     * 여러 설정 값을 한 번에 변경. 캐시를 모두 업데이트한 후 파일에 한 번만 저장한다.
     * [ClaudeCodeSettingsConfigurable.apply]의 반복 쓰기를 방지하기 위한 배치 메서드.
     * @param entries 변경할 키-값 쌍 맵
     * @return 저장 성공 여부
     */
    fun setAll(entries: Map<String, JsonElement>): Boolean = synchronized(lock) {
        saveInternal(entries)
    }

    /**
     * 모든 설정을 JsonObject로 반환한다. GET_SETTINGS 브릿지 메시지 처리용.
     * @return 전체 설정 JsonObject
     */
    fun getAll(): JsonObject = synchronized(lock) {
        refreshIfNeededInternal()
        buildJsonObject {
            cachedSettings.forEach { (k, v) -> put(k, v) }
        }
    }

    /**
     * 설정이 로드되었는지 여부
     */
    fun isReady(): Boolean = synchronized(lock) {
        isLoaded
    }

    /**
     * 현재 채팅 호스트 모드. 설정 파일이 아니라 [HostModeCache]에서 동기로 읽는다.
     *
     * 백엔드가 설정의 유일 진실원이므로(CLAUDE.md), `hostMode`만은 Kotlin이 파일을
     * 직접 읽지 않는다. WSL2에서는 백엔드가 Linux distro 안에서 실행되어 설정 파일을
     * Linux 홈(`/home/<user>/.claude-code-gui`)에 쓰지만, IDE 쪽 JVM의 `user.home`은
     * Windows 홈(`C:\Users\<user>`)이라 두 경로가 갈라진다. 그래서 Kotlin이 파일을 직접
     * 읽으면 사용자가 고른 값을 못 찾고 항상 [HostMode.EDITOR_TAB]로 폴백한다(이슈 #7).
     *
     * 대신 백엔드가 RPC로 푸시한 값을 [HostModeCache]가 [com.intellij.ide.util.PropertiesComponent]에
     * 캐싱하고, 라우팅([com.github.yhk1038.claudecodegui.hosting.ChatHostRouter.currentHost])은
     * 그 캐시를 동기로 읽는다. 캐시가 비어 있으면(아직 푸시 전) [HostMode.EDITOR_TAB] 폴백.
     */
    fun getHostMode(): HostMode = HostModeCache.read()

    // ---- Private helpers (lock 내부에서만 호출) ----

    /**
     * 설정 파일을 읽어 캐시에 로드하는 내부 구현.
     * lock 내부에서만 호출되므로 자체 동기화 없음.
     */
    private fun loadInternal(): Boolean {
        if (!settingsFile.exists()) return false

        val currentModified = settingsFile.lastModified()
        if (isLoaded && currentModified == lastModified) return true  // 캐시 유효

        return try {
            val content = settingsFile.readText()
            val parsed = JsSettingsParser.parse(content)
            cachedSettings = LinkedHashMap(defaults)  // 기본값으로 초기화 (순서 보존)
            cachedSettings.putAll(parsed)  // 파일 값으로 덮어쓰기
            lastModified = currentModified
            isLoaded = true
            true
        } catch (e: Exception) {
            logger.error("Failed to load settings from ${settingsFile.absolutePath}", e)
            isLoaded = false
            false
        }
    }

    /**
     * [edits]를 디스크의 현재 내용 위에 얹어 저장하는 내부 구현.
     * lock 내부에서만 호출되므로 자체 동기화 없음.
     *
     * 백엔드가 설정의 유일 진실원이므로(CLAUDE.md), **인메모리 캐시를 그대로 직렬화하지
     * 않고 디스크를 먼저 읽어 그 위에 변경분만 얹는다.** 캐시만 믿고 파일을 통째로 새로
     * 쓰면 이 클래스가 선언하지 않은 백엔드 전용 키 14개(`hostMode`, `openSettingsAs`,
     * `uiLanguage` 등)가 전부 사라진다. 사용자가 IDE 설정 화면(Settings → Tools →
     * Claude Code)에서 CLI Path 하나만 저장해도 "Sidebar" 선택이 조용히 "editor-tab"으로
     * 되돌아가던 원인이다(이슈 #7).
     *
     * 파일이 존재하는데 파싱에 실패하면 **저장을 거부한다.** 안에 무엇이 들어 있는지
     * 모르는 채로 기본값을 덮어쓰면 사용자 설정이 영구 소실되기 때문이다. 저장 실패는
     * 호출자에게 false로 전달되어 표면화된다.
     */
    private fun saveInternal(edits: Map<String, JsonElement>): Boolean {
        return try {
            settingsDir.toFile().mkdirs()  // 안전장치

            val onDisk: Map<String, JsonElement> = if (settingsFile.exists()) {
                try {
                    JsSettingsParser.parse(settingsFile.readText())
                } catch (e: Exception) {
                    logger.error(
                        "Refusing to overwrite unparseable settings file: ${settingsFile.absolutePath}",
                        e
                    )
                    return false
                }
            } else {
                emptyMap()
            }

            val merged = mergeForWrite(onDisk, edits)
            settingsFile.writeText(JsSettingsParser.generate(merged, commentMap))
            cachedSettings = LinkedHashMap(merged)
            lastModified = settingsFile.lastModified()
            isLoaded = true
            true
        } catch (e: Exception) {
            logger.error("Failed to save settings", e)
            false
        }
    }

    /**
     * 파일의 lastModified를 확인하고 변경 시 reload하는 내부 구현.
     * lock 내부에서만 호출되므로 자체 동기화 없음.
     */
    private fun refreshIfNeededInternal() {
        if (!settingsFile.exists()) return
        val currentModified = settingsFile.lastModified()
        if (currentModified != lastModified) {
            loadInternal()
        }
    }

    companion object {
        fun getInstance(): SettingsManager = service()

        /**
         * IDE 쪽이 아는 설정 키의 기본값. 백엔드의 `DEFAULT_SETTINGS`(23개)와 달리
         * 여기에는 이 플러그인의 설정 화면이 편집하는 키만 있다. **이 목록이 파일에
         * 쓸 키의 전체 집합이 아니라는 점이 핵심이다** — 나머지는 디스크에서 읽어
         * 보존한다. [mergeForWrite] 참조.
         */
        private val DEFAULTS: LinkedHashMap<String, JsonElement> = linkedMapOf(
            "cliPath" to JsonNull,
            "nodePath" to JsonNull,
            "theme" to JsonPrimitive("system"),
            "fontSize" to JsonPrimitive(13),
            "lineHeight" to JsonPrimitive(1.6),
            "debugMode" to JsonPrimitive(false),
            "logLevel" to JsonPrimitive("info"),
            "terminalApp" to JsonNull,
            "hostMode" to JsonPrimitive("editor-tab")
        )

        /**
         * 파일에 쓸 최종 맵을 만든다: `IDE 기본값 < 디스크의 현재 값 < 이번 변경분`.
         *
         * 디스크 값이 기본값을 이기므로 이 클래스가 모르는 백엔드 전용 키가 그대로
         * 살아남고, 변경분이 마지막이므로 사용자가 방금 고친 값이 반영된다. 순수 함수라
         * IntelliJ 서비스 컨테이너 없이 단위 테스트할 수 있다(SettingsFileMergeTest).
         */
        fun mergeForWrite(
            onDisk: Map<String, JsonElement>,
            edits: Map<String, JsonElement>,
        ): LinkedHashMap<String, JsonElement> {
            val merged = LinkedHashMap(DEFAULTS)
            merged.putAll(onDisk)
            merged.putAll(edits)
            return merged
        }
    }
}
