package com.peerdsa.chat;

import com.peerdsa.config.OpenRouterProperties;
import java.io.BufferedReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Streams a chat completion from OpenRouter's OpenAI-compatible endpoint. The response is a
 * Server-Sent Events stream of {@code choices[0].delta.content} fragments, terminated by a
 * {@code data: [DONE]} line; interspersed {@code :}-comment keep-alives are ignored.
 *
 * <p>The API key never leaves the backend. Failures are mapped to a {@link ResponseStatusException}
 * with a caller-safe message: a 429 (OpenRouter's free-tier limit) is a retryable 503, everything
 * else a 502, and the upstream detail is logged, never forwarded.
 */
@Component
public class OpenRouterClient {

    private static final Logger log = LoggerFactory.getLogger(OpenRouterClient.class);

    /**
     * Total attempts, not retries: 3 means at most two repeats. Low on purpose -- the caller is
     * usually a person watching a chat window, and the daily digest runs this once per subscriber,
     * so every extra attempt is paid hundreds of times over.
     */
    private static final int MAX_ATTEMPTS = 3;

    /** First backoff; doubles per attempt, plus jitter. */
    private static final long RETRY_BASE_MILLIS = 500;

    private final OpenRouterProperties props;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    public OpenRouterClient(OpenRouterProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(props.connectTimeout())
                .build();
    }

    /** A single turn sent upstream. Role is one of system/user/assistant. */
    public record Turn(String role, String content) {}

    /**
     * Streams the assistant's reply, handing each token fragment to {@code onToken} as it arrives,
     * and returns the full concatenated reply once the stream ends.
     *
     * @throws ResponseStatusException if chat is unconfigured, upstream errors, or the stream breaks
     */
    public String streamReply(List<Turn> messages, Consumer<String> onToken) {
        if (!props.isConfigured()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Chat is not configured on this server.");
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(props.baseUrl() + "/chat/completions"))
                .timeout(props.readTimeout())
                .header("Authorization", "Bearer " + props.apiKey())
                .header("Content-Type", "application/json")
                // OpenRouter uses these for app attribution on its dashboard; both are optional.
                .header("HTTP-Referer", props.referer())
                .header("X-Title", props.title())
                .POST(HttpRequest.BodyPublishers.ofString(requestBody(messages)))
                .build();

        for (int attempt = 1; ; attempt++) {
            try {
                HttpResponse<java.io.InputStream> response =
                        httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());

                if (response.statusCode() >= 300) {
                    if (shouldRetry(response.statusCode(), attempt)) {
                        // Drain rather than calling upstreamError: the body still has to be read to
                        // release the connection, but this attempt is not a failure yet and logging
                        // it at ERROR would put a false alarm in the log for every request that
                        // then succeeded on its second try.
                        drain(response.body());
                        backOff(attempt, "HTTP " + response.statusCode());
                        continue;
                    }
                    throw upstreamError(response);
                }

                // NOTHING past this line may be retried. consumeStream hands fragments to the
                // caller as they arrive, so by the time it can fail the user has already seen
                // part of an answer -- retrying would repeat that text rather than replace it.
                return consumeStream(response, onToken);

            } catch (ResponseStatusException e) {
                throw e;
            } catch (java.io.InterruptedIOException e) {
                Thread.currentThread().interrupt();
                log.warn("Chat stream interrupted or timed out", e);
                // Deliberately NOT retried. The read timeout is already generous (a free model is
                // slow), so a second attempt mostly doubles the wait before telling the user the
                // same thing.
                throw new ResponseStatusException(
                        HttpStatus.GATEWAY_TIMEOUT, "The assistant took too long to respond.");
            } catch (java.io.IOException e) {
                if (attempt < MAX_ATTEMPTS) {
                    backOff(attempt, e.toString());
                    continue;
                }
                log.warn("Chat stream failed after {} attempts", MAX_ATTEMPTS, e);
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY, "The assistant is unavailable right now.");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Request cancelled.");
            }
        }
    }

    /**
     * Whether a failed attempt is worth repeating.
     *
     * <p>Only failures that could plausibly succeed next time: a rate limit, and the 5xx family.
     * A 401 means the key is wrong, a 404 means the model id is wrong, a 400 means the request is
     * wrong -- none of those fix themselves, and retrying them just makes the user wait three times
     * as long to be told the same thing while tripling the load on an upstream that is already
     * refusing.
     */
    private static boolean shouldRetry(int status, int attempt) {
        if (attempt >= MAX_ATTEMPTS) {
            return false;
        }
        return status == 429 || status >= 500;
    }

    /**
     * Waits before the next attempt, doubling each time with a little jitter.
     *
     * <p>Jitter because every user whose request failed would otherwise retry in lockstep and
     * arrive at the upstream together -- turning one rate limit into a self-inflicted thundering
     * herd. Kept short: the caller is a person watching a chat window, and the digest narrator
     * runs this once per subscriber, so a long backoff is paid many times over.
     */
    private void backOff(int attempt, String because) {
        long millis = RETRY_BASE_MILLIS * (1L << (attempt - 1));
        millis += java.util.concurrent.ThreadLocalRandom.current().nextLong(RETRY_BASE_MILLIS);
        log.info("Retrying the chat completion in {}ms (attempt {} failed: {})", millis, attempt, because);
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Request cancelled.");
        }
    }

    private String requestBody(List<Turn> messages) {
        ObjectNode root = mapper.createObjectNode();
        root.put("model", props.model());
        root.put("stream", true);
        ArrayNode arr = root.putArray("messages");
        for (Turn t : messages) {
            ObjectNode m = arr.addObject();
            m.put("role", t.role());
            m.put("content", t.content());
        }
        return root.toString();
    }

    /** Reads the SSE body, forwarding each delta and accumulating the whole reply. */
    private String consumeStream(HttpResponse<java.io.InputStream> response, Consumer<String> onToken) {
        StringBuilder full = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new java.io.InputStreamReader(response.body(), java.nio.charset.StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("data:")) {
                    continue; // keep-alive comments (":") and blank separators
                }
                String data = line.substring(5).strip();
                if (data.equals("[DONE]")) {
                    break;
                }
                String delta = extractDelta(data);
                if (delta != null && !delta.isEmpty()) {
                    full.append(delta);
                    onToken.accept(delta);
                }
            }
        } catch (java.io.IOException e) {
            log.warn("Chat stream broke mid-response", e);
            // Partial content is still worth keeping if we already streamed some of it.
            if (full.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The assistant's response was cut off.");
            }
        }
        return full.toString();
    }

    /** Pulls choices[0].delta.content out of one SSE data payload, tolerating malformed chunks. */
    private String extractDelta(String data) {
        try {
            JsonNode node = mapper.readTree(data);
            JsonNode choices = node.get("choices");
            if (choices == null || !choices.isArray() || choices.isEmpty()) {
                return null;
            }
            JsonNode content = choices.get(0).path("delta").path("content");
            return content.isString() ? content.asString() : null;
        } catch (RuntimeException e) {
            // A single unparseable chunk must not abort the whole stream.
            log.debug("Skipping unparseable SSE chunk: {}", data, e);
            return null;
        }
    }

    private ResponseStatusException upstreamError(HttpResponse<java.io.InputStream> response) {
        String body = drain(response.body());
        int status = response.statusCode();
        log.error("OpenRouter returned {} for a chat completion. Body: {}", status, body);
        if (status == 429) {
            return new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "The assistant is rate-limited right now. Try again shortly.");
        }
        if (status == 401 || status == 403) {
            // A bad or missing OPENROUTER_API_KEY. Operator problem, not the user's.
            return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The assistant is misconfigured.");
        }
        if (status == 404) {
            // Almost always a stale model id. OpenRouter's free list rotates, so an id that worked
            // last month 404s today -- and the generic "unavailable" message sent operators looking
            // at the network when the answer was one environment variable.
            return new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "The assistant's model is not available. Check OPENROUTER_MODEL -- the free list rotates.");
        }
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The assistant is unavailable right now.");
    }

    private static String drain(java.io.InputStream in) {
        try (in) {
            return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (java.io.IOException e) {
            return "<unreadable>";
        }
    }

    /** Convenience for building the upstream message list with the system prompt first. */
    public List<Turn> withSystemPrompt(List<Turn> conversation) {
        List<Turn> all = new ArrayList<>(conversation.size() + 1);
        if (props.systemPrompt() != null && !props.systemPrompt().isBlank()) {
            all.add(new Turn("system", props.systemPrompt()));
        }
        all.addAll(conversation);
        return all;
    }
}
