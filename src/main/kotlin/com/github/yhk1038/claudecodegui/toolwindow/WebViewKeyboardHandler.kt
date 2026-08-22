package com.github.yhk1038.claudecodegui.toolwindow

import org.cef.browser.CefBrowser
import org.cef.handler.CefKeyboardHandler
import org.cef.handler.CefKeyboardHandlerAdapter
import org.cef.misc.BoolRef
import org.cef.misc.EventFlags
import java.awt.event.KeyEvent

/**
 * WebView 키보드 핸들러
 *
 * 특정 키 조합이 IDE에 의해 가로채지지 않도록
 * is_keyboard_shortcut을 false로 설정하여 WebView로 키 이벤트를 전달합니다.
 *
 * 처리하는 단축키:
 * - macOS: Cmd+Arrow, Option+Arrow (텍스트 내비게이션)
 * - macOS: Cmd+, (설정 열기 - IntelliJ Settings 다이얼로그 방지)
 * - Windows/Linux: Ctrl+, (설정 열기)
 *
 * DevTools에는 키를 배정하지 않는다. 예전에는 F12가 열었으나, CEF 키 핸들러는
 * IntelliJ 액션 시스템을 거치지 않으므로 채팅이 IDE의 F12 단축키를 통째로 삼켰고
 * (WebStorm의 Alt+F12 = 터미널 도구창) 사용자가 끌 방법도 없었다(이슈 #333).
 * 지금은 설정 화면의 "DevTools 열기" 버튼으로만 연다.
 */
class WebViewKeyboardHandler : CefKeyboardHandlerAdapter() {

    companion object {
        // Arrow key codes (AWT KeyEvent 상수 사용 - Windows VK code와 동일)
        private val ARROW_KEYS = setOf(
            KeyEvent.VK_LEFT,   // 37
            KeyEvent.VK_RIGHT,  // 39
            KeyEvent.VK_UP,     // 38
            KeyEvent.VK_DOWN    // 40
        )

        // Comma key code (Windows VK_OEM_COMMA = 0xBC = 188)
        // 주의: AWT KeyEvent.VK_COMMA(44)와 다름. CEF는 Windows VK code를 사용.
        private const val VK_OEM_COMMA = 188
    }

    override fun onPreKeyEvent(
        browser: CefBrowser?,
        event: CefKeyboardHandler.CefKeyEvent?,
        is_keyboard_shortcut: BoolRef?
    ): Boolean {
        if (event == null || is_keyboard_shortcut == null) {
            return false
        }

        val keyCode = event.windows_key_code
        val modifiers = event.modifiers

        val isMetaDown = (modifiers and EventFlags.EVENTFLAG_COMMAND_DOWN) != 0
        val isAltDown = (modifiers and EventFlags.EVENTFLAG_ALT_DOWN) != 0
        val isCtrlDown = (modifiers and EventFlags.EVENTFLAG_CONTROL_DOWN) != 0
        val isArrowKey = keyCode in ARROW_KEYS

        // macOS: Cmd+Arrow, Option+Arrow (텍스트 내비게이션)
        if (isArrowKey && (isMetaDown || isAltDown)) {
            is_keyboard_shortcut.set(false)
        }

        // Cmd+, (macOS) 또는 Ctrl+, (Windows/Linux) - 설정 열기
        // IntelliJ의 ShowSettings 액션이 가로채지 않도록 WebView로 전달
        if (keyCode == VK_OEM_COMMA && (isMetaDown || isCtrlDown)) {
            is_keyboard_shortcut.set(false)
        }

        // Return false to allow normal processing
        return false
    }
}
