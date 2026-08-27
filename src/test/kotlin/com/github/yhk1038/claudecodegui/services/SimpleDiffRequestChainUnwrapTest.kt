package com.github.yhk1038.claudecodegui.services

import com.intellij.diff.chains.SimpleDiffRequestChain
import com.intellij.diff.requests.SimpleDiffRequest
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

/**
 * Guards the fix for issue #359: reopening a review to add the "base changed"
 * banner has to get the original request back out of the chain it was put into.
 *
 * The trap is that [SimpleDiffRequestChain] does not store what it was given.
 * It wraps each request in a `DiffRequestProducerWrapper`, so reading the chain
 * back with `as? SimpleDiffRequest` always yields null — and the reopen returned
 * silently, leaving the banner undrawn on the IDE's diff viewer while every log
 * upstream said the notice had been delivered.
 *
 * This asserts the platform behaviour directly rather than the plugin's own
 * code, because the plugin code is only correct insofar as this is true. If a
 * future IDE stores requests unwrapped, the unwrap branch becomes dead and the
 * `else` branch carries it — that is why [DiffService] handles both.
 *
 * A live `Project` is not needed: a chain over a request with no contents is a
 * plain object, and nothing here opens a viewer.
 */
class SimpleDiffRequestChainUnwrapTest {

    private fun chainOver(request: SimpleDiffRequest) = SimpleDiffRequestChain(request)

    @Test
    fun `the chain does not hand back the request that was put in`() {
        val request = SimpleDiffRequest("Diff: sample", emptyList(), emptyList())

        val stored = chainOver(request).requests.firstOrNull()

        assertNotNull(stored) { "The chain reported no requests at all." }
        assertNull(stored as? SimpleDiffRequest) {
            "SimpleDiffRequestChain now stores requests unwrapped, so the unwrap step in " +
                "DiffService.reopenWithCurrentBanner is no longer what makes the reopen work. " +
                "Stored as: ${stored!!.javaClass.name}"
        }
    }

    @Test
    fun `unwrapping the producer yields the original request`() {
        val request = SimpleDiffRequest("Diff: sample", emptyList(), emptyList())

        val stored = chainOver(request).requests.first()
        val unwrapped = (stored as? SimpleDiffRequestChain.DiffRequestProducerWrapper)?.request

        assertSame(request, unwrapped) {
            "Unwrapping DiffRequestProducerWrapper did not give back the request the chain was " +
                "built from, so the review cannot be reopened with its banner (#359)."
        }
    }

    /**
     * The shape [DiffService] relies on, end to end: put a request in, read it
     * back out as a [SimpleDiffRequest]. Fails against the pre-fix code, which
     * cast the stored producer directly.
     */
    @Test
    fun `a request survives a round trip through the chain`() {
        val request = SimpleDiffRequest("Diff: sample", emptyList(), emptyList())

        val stored = chainOver(request).requests.firstOrNull()
        val recovered = when (stored) {
            is SimpleDiffRequestChain.DiffRequestProducerWrapper -> stored.request
            else -> stored
        } as? SimpleDiffRequest

        assertSame(request, recovered) {
            "The request could not be recovered from the chain, so reopenWithCurrentBanner " +
                "returns before drawing anything and the banner never appears (#359)."
        }
    }
}
