package com.github.yhk1038.claudecodegui.settings

import kotlinx.serialization.json.*

/**
 * JS `export default { ... }` 형식의 설정 파일을 파싱하고 생성하는 유틸리티.
 *
 * 파싱 파이프라인:
 * 1. stripComments() - 주석 제거 (상태 머신 기반, 문자열 리터럴 보존)
 * 2. unwrapExportDefault() - export default 접두사/trailing ; 제거
 * 3. removeTrailingCommas() - JSON 비호환 trailing comma 제거
 * 4. quoteUnquotedKeys() - 따옴표 없는 키에 따옴표 추가 (belt-and-suspenders)
 * 5. kotlinx.serialization.json (isLenient) 으로 파싱
 */
object JsSettingsParser {

    private val lenientJson = Json {
        isLenient = true
        ignoreUnknownKeys = true
    }

    /**
     * JS 설정 파일 내용을 Map<String, JsonElement>로 파싱
     * @param jsContent settings.js 파일 전체 내용
     * @return 파싱된 설정 맵
     * @throws IllegalArgumentException 파싱 실패 시
     */
    fun parse(jsContent: String): Map<String, JsonElement> {
        // A UTF-8 byte order mark is not part of the content. Windows tools (PowerShell's
        // `-Encoding UTF8`, Notepad) put one at the start of a file, and the parser below
        // reads it as a stray character before `export` and rejects the whole file.
        val stripped = stripComments(jsContent.removePrefix("\uFEFF"))
        val unwrapped = unwrapExportDefault(stripped)
        val noTrailing = removeTrailingCommas(unwrapped)
        val quoted = quoteUnquotedKeys(noTrailing)
        return lenientJson.parseToJsonElement(quoted).jsonObject.toMap()
    }

    /**
     * 설정 맵을 export default { ... } 형식의 JS 문자열로 생성
     * @param settings 설정 맵 (순서 보존을 위해 LinkedHashMap 권장)
     * @param comments 각 키에 대한 한글 주석 맵
     * @return settings.js 파일 내용
     */
    fun generate(settings: Map<String, JsonElement>, comments: Map<String, String>): String {
        val sb = StringBuilder()
        sb.appendLine("// ~/.claude-code-gui/settings.js")
        sb.appendLine("// Claude Code GUI - 사용자 설정")
        sb.appendLine("export default {")

        val entries = settings.entries.toList()
        for ((index, entry) in entries.withIndex()) {
            val comment = comments[entry.key]
            if (comment != null) {
                if (index > 0) sb.appendLine()  // 빈 줄 구분
                sb.appendLine("  // $comment")
            }
            val comma = if (index < entries.size - 1) "," else ""
            val valueStr = when (val v = entry.value) {
                is JsonNull -> "null"
                is JsonPrimitive -> if (v.isString) "\"${escapeStringValue(v.content)}\"" else v.content
                else -> v.toString()
            }
            sb.appendLine("  ${entry.key}: $valueStr$comma")
        }

        sb.appendLine("}")
        return sb.toString()
    }

    /**
     * JS 내용에서 주석을 제거.
     * 상태 머신 기반으로 문자열 리터럴 내부는 보존한다.
     *
     * 상태: NORMAL, IN_STRING_DOUBLE, IN_STRING_SINGLE, IN_LINE_COMMENT, IN_BLOCK_COMMENT
     */
    internal fun stripComments(input: String): String {
        val sb = StringBuilder()
        var i = 0
        var state = State.NORMAL

        while (i < input.length) {
            when (state) {
                State.NORMAL -> {
                    when {
                        // 한 줄 주석 시작
                        i + 1 < input.length && input[i] == '/' && input[i + 1] == '/' -> {
                            state = State.IN_LINE_COMMENT
                            i += 2
                        }
                        // 블록 주석 시작
                        i + 1 < input.length && input[i] == '/' && input[i + 1] == '*' -> {
                            state = State.IN_BLOCK_COMMENT
                            i += 2
                        }
                        // 큰따옴표 문자열 시작
                        input[i] == '"' -> {
                            state = State.IN_STRING_DOUBLE
                            sb.append(input[i])
                            i++
                        }
                        // 작은따옴표 문자열 시작
                        input[i] == '\'' -> {
                            state = State.IN_STRING_SINGLE
                            sb.append(input[i])
                            i++
                        }
                        else -> {
                            sb.append(input[i])
                            i++
                        }
                    }
                }
                State.IN_STRING_DOUBLE -> {
                    if (input[i] == '\\' && i + 1 < input.length) {
                        // 이스케이프 시퀀스 보존
                        sb.append(input[i])
                        sb.append(input[i + 1])
                        i += 2
                    } else if (input[i] == '"') {
                        state = State.NORMAL
                        sb.append(input[i])
                        i++
                    } else {
                        sb.append(input[i])
                        i++
                    }
                }
                State.IN_STRING_SINGLE -> {
                    if (input[i] == '\\' && i + 1 < input.length) {
                        sb.append(input[i])
                        sb.append(input[i + 1])
                        i += 2
                    } else if (input[i] == '\'') {
                        state = State.NORMAL
                        sb.append(input[i])
                        i++
                    } else {
                        sb.append(input[i])
                        i++
                    }
                }
                State.IN_LINE_COMMENT -> {
                    if (input[i] == '\n') {
                        state = State.NORMAL
                        sb.append('\n')  // 줄바꿈은 보존
                    }
                    i++
                }
                State.IN_BLOCK_COMMENT -> {
                    if (i + 1 < input.length && input[i] == '*' && input[i + 1] == '/') {
                        state = State.NORMAL
                        i += 2
                    } else {
                        i++
                    }
                }
            }
        }

        return sb.toString()
    }

    /**
     * export default 접두사와 trailing 세미콜론 제거
     */
    internal fun unwrapExportDefault(input: String): String {
        var s = input.trim()
        // export default 접두사 제거
        s = s.replace(Regex("""^\s*export\s+default\s*"""), "")
        // trailing 세미콜론 제거
        s = s.trimEnd().removeSuffix(";").trimEnd()
        return s
    }

    /**
     * trailing comma 제거 (JSON 호환)
     *
     * 제한사항: 이 정규식은 문자열 리터럴 내부의 콤마도 대상으로 삼을 수 있다.
     * 현재 사용 사례(settings.js)에서는 사용자가 자유 텍스트를 입력하는 항목이 없으므로
     * 이 제한이 문제되지 않는다. 만약 향후 자유 텍스트 설정이 추가된다면
     * 문자열-인식 파서로 교체해야 한다.
     */
    internal fun removeTrailingCommas(input: String): String {
        // NOTE: 이 정규식은 문자열 리터럴 내부를 구분하지 않는다.
        // settings.js의 값은 모두 제한된 enum/숫자/불리언이므로 현재는 안전하다.
        // 자유 텍스트 설정이 추가된다면 문자열-인식 파서로 교체 필요.
        return input.replace(Regex(",(\\s*[}\\]])"), "$1")
    }

    /**
     * 따옴표 없는 키에 따옴표를 추가 (belt-and-suspenders)
     * isLenient=true가 unquoted key를 지원하지만, 안전장치로 사전 처리.
     *
     * 제한사항: 평면(flat) 단일 레벨 객체만 지원한다.
     * 중첩 객체가 포함된 경우 내부 키도 잘못 매칭될 수 있으므로,
     * 중첩 설정이 추가된다면 이 함수를 교체해야 한다.
     */
    internal fun quoteUnquotedKeys(input: String): String {
        return input.replace(Regex("""(?<=\{|,)\s*(\w+)\s*:""")) { match ->
            val key = match.groupValues[1]
            match.value.replace(key, "\"$key\"")
        }
    }

    /**
     * 문자열 값의 특수 문자를 이스케이프
     * - 백슬래시 -> \\
     * - 큰따옴표 -> \"
     * - 개행 -> \n
     * - 탭 -> \t
     */
    private fun escapeStringValue(value: String): String {
        return value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\t", "\\t")
    }

    private enum class State {
        NORMAL,
        IN_STRING_DOUBLE,
        IN_STRING_SINGLE,
        IN_LINE_COMMENT,
        IN_BLOCK_COMMENT
    }
}
