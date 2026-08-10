package com.peerdsa.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.peerdsa.config.OpenRouterProperties;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * The SSE parsing and error mapping are the parts most likely to break, so they are tested against
 * a real (local) HTTP server streaming canned OpenAI-style responses -- no OpenRouter account, no
 * network. Covers: delta assembly, keep-alive/[DONE] handling, the unconfigured guard, and the
 * rate-limit / bad-key status translations.
 */
class OpenRouterClientTest {

    private final ObjectMapper mapper = JsonMapper.builder().build();
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void streamsEachDeltaInOrderAndReturnsTheAssembledReply() throws Exception {
        String sse = ": OPENROUTER PROCESSING\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n"
                + "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n"
                + "data: [DONE]\n\n";
        String base = start(200, "text/event-stream", sse);
        OpenRouterClient client = new OpenRouterClient(props(base, "sk-test"), mapper);

        List<String> tokens = new ArrayList<>();
        String full = client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), tokens::add);

        assertThat(tokens).containsExactly("Hel", "lo", " world");
        assertThat(full).isEqualTo("Hello world");
    }

    @Test
    void aBlankApiKeyReportsUnconfiguredWithoutCallingUpstream() {
        OpenRouterClient client = new OpenRouterClient(props("http://localhost:1", "  "), mapper);

        assertThatThrownBy(() -> client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), t -> {}))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void aRateLimitIsARetryable503() throws Exception {
        String base = start(429, "application/json", "{\"error\":\"rate limited\"}");
        OpenRouterClient client = new OpenRouterClient(props(base, "sk-test"), mapper);

        assertThatThrownBy(() -> client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), t -> {}))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void aBadApiKeyIsA502NotSurfacedToTheUser() throws Exception {
        String base = start(401, "application/json", "{\"error\":\"invalid key\"}");
        OpenRouterClient client = new OpenRouterClient(props(base, "sk-bad"), mapper);

        assertThatThrownBy(() -> client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), t -> {}))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_GATEWAY));
    }

    /**
     * A 404 is almost always a stale model id -- OpenRouter's free list rotates, so an id that
     * worked last month fails today. The generic "unavailable" message sent operators looking at
     * the network when the answer was one environment variable.
     */
    @Test
    void anUnknownModelSaysSoRatherThanBlamingTheNetwork() throws Exception {
        String base = start(404, "application/json", "{\"error\":\"No endpoints found for that model\"}");
        OpenRouterClient client = new OpenRouterClient(props(base, "sk-test"), mapper);

        assertThatThrownBy(() -> client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), t -> {}))
                .isInstanceOf(ResponseStatusException.class)
                // Names the variable to change, rather than sending the operator to the network.
                .hasMessageContaining("OPENROUTER_MODEL");
    }

    @Test
    void withSystemPromptPrependsTheConfiguredPrompt() {
        OpenRouterClient client = new OpenRouterClient(props("http://localhost:1", "sk-test"), mapper);

        List<OpenRouterClient.Turn> turns =
                client.withSystemPrompt(List.of(new OpenRouterClient.Turn("user", "hi")));

        assertThat(turns).hasSize(2);
        assertThat(turns.get(0).role()).isEqualTo("system");
        assertThat(turns.get(1).role()).isEqualTo("user");
    }

    private OpenRouterProperties props(String baseUrl, String apiKey) {
        return new OpenRouterProperties(
                apiKey,
                baseUrl,
                "test/model:free",
                "You are a tutor.",
                20,
                Duration.ofSeconds(2),
                Duration.ofSeconds(10),
                "http://ref",
                "test");
    }

    /** Serves one canned response at /chat/completions and returns the base URL. */
    private String start(int status, String contentType, String body) throws Exception {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", contentType);
            exchange.sendResponseHeaders(status, 0); // 0 => chunked, like a real stream
            try (var os = exchange.getResponseBody()) {
                os.write(bytes);
                os.flush();
            }
        });
        server.start();
        return "http://localhost:" + server.getAddress().getPort();
    }
}
