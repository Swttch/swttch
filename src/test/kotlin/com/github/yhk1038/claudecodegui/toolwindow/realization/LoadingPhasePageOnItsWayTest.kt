package com.github.yhk1038.claudecodegui.toolwindow.realization

import com.github.yhk1038.claudecodegui.remotedev.ClientPortForwarder
import com.jetbrains.rd.platform.codeWithMe.portForwarding.PerClientPortForwardingManager
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/**
 * Which loading label a panel shows while its page is on the way (issue #526).
 *
 * The label says "(SSH)" only when a client on another machine draws the page. It used
 * to follow how the browser renders, and out-of-process JCEF is the default in a local
 * IDE too, so a user with no SSH anywhere read "Loading the screen (SSH)...". The
 * Remote Development API is stood in for by classes of the same names, so the real
 * lookup of attached clients runs here.
 */
class LoadingPhasePageOnItsWayTest {

    @BeforeEach
    @AfterEach
    fun noRemoteClientsByDefault() {
        PerClientPortForwardingManager.instances = emptyList()
    }

    @Test
    fun `an IDE with no remote client attached does not mention SSH`() {
        assertEquals(LoadingPhase.LOADING_UI, LoadingPhase.pageOnItsWay(ClientPortForwarder.attachedClients()))
    }

    @Test
    fun `an IDE with a remote client attached names the link the wait is spent on`() {
        PerClientPortForwardingManager.instances = listOf(PerClientPortForwardingManager())

        assertEquals(LoadingPhase.LOADING_UI_REMOTE, LoadingPhase.pageOnItsWay(ClientPortForwarder.attachedClients()))
    }

    @Test
    fun `any number of attached clients is still a remote link`() {
        PerClientPortForwardingManager.instances =
            listOf(PerClientPortForwardingManager(), PerClientPortForwardingManager())

        assertEquals(LoadingPhase.LOADING_UI_REMOTE, LoadingPhase.pageOnItsWay(ClientPortForwarder.attachedClients()))
    }
}
