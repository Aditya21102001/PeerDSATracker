package com.peerdsa.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds {@code app.openrouter.*}. The API key stays server-side; the browser never sees it.
 *
 * @param apiKey OpenRouter key ({@code sk-or-v1-...}). Blank disables the chat feature, which then
 *     reports itself as unconfigured rather than calling upstream with an empty credential.
 * @param baseUrl OpenRouter API root, ending before {@code /chat/completions}.
 * @param model a free model id ending in {@code :free}. OpenRouter's free list rotates, so this is
 *     an env var, not a constant. {@code openrouter/free} is NOT valid -- it will 404.
 * @param systemPrompt injected as the first message on every call; never persisted.
 * @param maxHistory how many of the most recent stored messages to replay as context. Caps the
 *     token bill on a long thread.
 * @param connectTimeout TCP connect budget.
 * @param readTimeout how long to wait between streamed chunks before giving up.
 * @param referer sent as {@code HTTP-Referer}; OpenRouter uses it for app attribution.
 * @param title sent as {@code X-Title}; the app name shown on OpenRouter's dashboard.
 */
@ConfigurationProperties(prefix = "app.openrouter")
public record OpenRouterProperties(
        String apiKey,
        String baseUrl,
        String model,
        String systemPrompt,
        int maxHistory,
        Duration connectTimeout,
        Duration readTimeout,
        String referer,
        String title) {

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
