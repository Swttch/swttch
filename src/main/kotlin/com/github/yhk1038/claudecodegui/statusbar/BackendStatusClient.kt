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

    /** Fetch the status snapshot from the backend on [port], or null on any failure. */
    fun fetch(port: Int): BackendStatus? {
        return try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:$port/internal/status"))
                .timeout(Duration.ofMillis(1_500))
                .GET()
                .build()
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() != 200) return null
            json.decodeFromString<BackendStatus>(response.body())
        } catch (e: Exception) {
            logger.debug("GET /internal/status failed on port $port", e)
            null
        }
    }
}
