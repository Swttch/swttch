package com.github.yhk1038.claudecodegui.bridge

/**
 * An IDE-side request failed for a reason the person should be told about, as opposed to a bug in
 * the plugin: the file dialog could not be opened, no panel is open to open it in.
 *
 * The RPC dispatcher answers it with a JSON-RPC error carrying [message] and logs it as a warning.
 * It does not take the plugin's error boundary: no IDE "internal error" balloon, no error report.
 * A failure the chat is about to explain is not an incident.
 */
class RpcUserFacingException(message: String, cause: Throwable? = null) : Exception(message, cause)
