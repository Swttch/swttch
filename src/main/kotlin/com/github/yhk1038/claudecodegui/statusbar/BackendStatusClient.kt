package com.github.yhk1038.claudecodegui.statusbar

import com.intellij.openapi.diagnostic.Logger
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * Blocking client for the backend's `GET /internal/status` endpoint (loopback
 * only). Called off the EDT by the status-bar card's refresh alarm; every
 * failure maps to null so a dying backend degrades to "no counters" instead of
 * an error. The payload mirrors backend/src/ws/status-route.ts.
 */
object BackendStatusClient {

    private val logger = Logger.getInstance(BackendStatusClient::class.java)

    @Serializable
    data class ConnectionStats(
        val total: Int,
        val panels: Int,
        val tunnels: Int,
        val browsers: Int,
    )

    @Serializable
    data class SessionStats(
        val total: Int,
        val streaming: Int,
    )

    @Serializable
    data class BackendStatus(
        val keepAlive: Boolean,
        val connections: ConnectionStats,
        val sessions: SessionStats,
    )

    @Serializable
    private data class LocalPairResponse(val code: String)

    private val json = Json { ignoreUnknownKeys = true }

    // HTTP/1.1 is mandatory: the default (HTTP_2) sends an h2c upgrade request
    // (`Connection: Upgrade, HTTP2-Settings`), and the backend's HTTP server has a
    // WebSocket 'upgrade' handler that destroys the socket of every non-WebSocket
    // upgrade — the fetch then dies with "EOF reached while reading" before any
    // response arrives (curl works because it never attempts the upgrade).
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(Duration.ofMillis(1_000))
        .build()

    /**
     * Fetch the status snapshot from the backend on [port], or null on any failure.
     * [authToken] is required to pass the backend's /internal route auth gate (mirrors
     * [fetchLocalPairCode]); a missing/wrong token yields a 401 and thus null.
     */
    fun fetch(port: Int, authToken: String?): BackendStatus? {
        return try {
            val builder = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:$port/internal/status"))
                .timeout(Duration.ofMillis(1_500))
                .GET()
            if (!authToken.isNullOrEmpty()) builder.header("x-ccg-token", authToken)
            val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() != 200) return null
            json.decodeFromString<BackendStatus>(response.body())
        } catch (e: Exception) {
            logger.debug("GET /internal/status failed on port $port", e)
            null
        }
    }

    /**
     * Mint a fresh single-use LOCAL pairing code from the backend on [port], or null
     * on any failure. The system browser (opened by the status-card "Open" link) has
     * no auth token, so the card embeds this code as `?pair=<code>` in the loopback
     * URL; the browser redeems it at POST /pair for the real token.
     *
     * [authToken] is the backend's per-launch control-channel token, sent in the
     * `x-ccg-token` header the backend requires on every /internal route (mirrors
     * IdeSelectionDispatcher.postIdeSelection). The returned code is NEVER logged.
     */
    fun fetchLocalPairCode(port: Int, authToken: String?): String? {
        return try {
            val builder = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:$port/internal/local-pair"))
                .timeout(Duration.ofMillis(1_500))
                .GET()
            if (!authToken.isNullOrEmpty()) builder.header("x-ccg-token", authToken)
            val response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() != 200) return null
            json.decodeFromString<LocalPairResponse>(response.body()).code
        } catch (e: Exception) {
            // Never log the response body / code — only the failure of the call itself.
            logger.debug("GET /internal/local-pair failed on port $port", e)
            null
        }
    }
}
