package com.github.yhk1038.claudecodegui.toolwindow.stalled

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Which IDE options the stalled-screen guide tells the user about, and in what state.
 *
 * The guide must show an option only while there is something left to do about it: one
 * that is already in effect is not mentioned, and one the user wrote but has not
 * restarted for gets only the restart. Judged here without an IDE.
 */
class JcefSwitchAdvisorTest {

    private fun env(
        separateProcess: Boolean = true,
        properties: Map<String, String> = emptyMap(),
        file: String? = null,
        windows: Boolean = false,
        version: String = "2026.2.3",
        wayland: Boolean = false,
    ) = JcefEnvironment(
        separateProcessBrowserInUse = separateProcess,
        systemProperty = { properties[it] },
        propertiesFileText = file,
        isWindows = windows,
        ideFullVersion = version,
        isNativeWayland = wayland,
    )

    private fun JcefEnvironment.opensInOwnWindow(switch: JcefSwitch): Boolean? =
        JcefSwitchAdvisor.advise(this).firstOrNull { it.switch == switch }?.opensInOwnWindow

    private fun JcefEnvironment.stateOf(switch: JcefSwitch): SwitchState? =
        JcefSwitchAdvisor.advise(this).firstOrNull { it.switch == switch }?.state

    @Test
    fun `nothing set means both options need the user`() {
        val env = env()

        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.NO_GPU))
    }

    @Test
    fun `a browser that already runs inside the IDE is not mentioned`() {
        val env = env(separateProcess = false)

        assertEquals(null, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `the separate-process option is judged by what happens, not by a property name`() {
        // The property says "false" under a name this IDE might not read, yet the browser is
        // still a separate process. The observation wins, so the guide still shows.
        val env = env(
            separateProcess = true,
            properties = mapOf("ide.browser.jcef.out-of-process.enabled" to "false"),
        )

        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `lines in the file that the running IDE has not read yet await a restart`() {
        val env = env(file = "# mine\nide.browser.jcef.out-of-process.enabled=false\n")

        assertEquals(SwitchState.WRITTEN_AWAITING_RESTART, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `either known spelling in the file counts as written`() {
        val env = env(file = "jcef.remote.enabled=false")

        assertEquals(SwitchState.WRITTEN_AWAITING_RESTART, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `a line with the wrong value does not count as written`() {
        val env = env(file = "ide.browser.jcef.out-of-process.enabled=true")

        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `the later line wins just as it does when the IDE reads the file`() {
        val env = env(file = "ide.browser.jcef.out-of-process.enabled=false\nide.browser.jcef.out-of-process.enabled=true")

        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `graphics acceleration already off in this run is not mentioned`() {
        val env = env(properties = mapOf("ide.browser.jcef.gpu.disable" to "true"))

        assertEquals(null, env.stateOf(JcefSwitch.NO_GPU))
    }

    @Test
    fun `graphics acceleration written but not yet restarted awaits a restart`() {
        val env = env(file = "ide.browser.jcef.gpu.disable=true")

        assertEquals(SwitchState.WRITTEN_AWAITING_RESTART, env.stateOf(JcefSwitch.NO_GPU))
    }

    @Test
    fun `Windows with IDE 2025_2_3 is never told to turn the separate process off`() {
        val env = env(windows = true, version = "2025.2.3")

        assertEquals(null, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.NO_GPU))
    }

    @Test
    fun `the same IDE version on another system is told as usual`() {
        val env = env(windows = false, version = "2025.2.3")

        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `a malformed file is read as empty rather than failing`() {
        val env = env(file = "broken=\\uZZZZ")

        assertEquals(SwitchState.NEEDED, env.stateOf(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `on native Wayland the browser-inside-the-IDE option warns that the screen opens in its own window`() {
        val env = env(wayland = true)

        assertEquals(true, env.opensInOwnWindow(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `the window warning does not belong to the graphics option or to other systems`() {
        assertEquals(false, env(wayland = true).opensInOwnWindow(JcefSwitch.NO_GPU))
        assertEquals(false, env(wayland = false).opensInOwnWindow(JcefSwitch.IN_PROCESS_BROWSER))
    }

    @Test
    fun `every spelling of a switch is offered in the text the user pastes`() {
        val text = JcefSwitch.IN_PROCESS_BROWSER.pasteText.lines()

        assertTrue("ide.browser.jcef.out-of-process.enabled=false" in text)
        assertTrue("jcef.remote.enabled=false" in text)
    }
}
