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

    /**
     * OpenRouter's free tier rate-limits constantly and its instances restart, so the first attempt
     * failing is ordinary rather than exceptional. Giving up on it turned a blip into "the
     * assistant is unavailable right now" -- an error the user can do nothing with and which is
     * wrong by the time they read it.
     */
    @Test
    void aRateLimitIsRetriedAndTheSecondAttemptSucceeds() throws Exception {
        String sse = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n";
        String base = startSequence(
                new Canned(429, "application/json", "{\"error\":\"rate limited\"}"),
                new Canned(200, "text/event-stream", sse));
        OpenRouterClient client = new OpenRouterClient(props(base, "sk-test"), mapper);

        List<String> tokens = new ArrayList<>();
        String full = client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), tokens::add);

        assertThat(full).isEqualTo("hi");
        // The failed attempt must not leak into the answer the user sees.
        assertThat(tokens).containsExactly("hi");
        assertThat(requests.get()).isEqualTo(2);
    }

    /** A 5xx is the upstream's own fault and is worth one more go. */
    @Test
    void anUpstreamServerErrorIsRetried() throws Exception {
        String base = startSequence(
                new Canned(500, "application/json", "{\"error\":\"boom\"}"),
                new Canned(200, "text/event-stream", "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\ndata: [DONE]\n\n"));
        OpenRouterClient client = new OpenRouterClient(props(base, "sk-test"), mapper);

        assertThat(client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), t -> {}))
                .isEqualTo("ok");
        assertThat(requests.get()).isEqualTo(2);
    }

    /**
     * The point of the retry is that it is selective.
     *
     * <p>A bad key and a stale model id fail identically on every attempt, so retrying them only
     * makes the user wait three times as long to be told the same thing -- while tripling the load
     * on an upstream that is already refusing. If this ever reports more than one request, the
     * retry has stopped distinguishing "try again" from "this is broken".
     */
    @Test
    void aMisconfigurationIsNotRetried() throws Exception {
        for (int status : new int[] {401, 403, 404, 400}) {
            String base = startSequence(new Canned(status, "application/json", "{\"error\":\"nope\"}"));
            OpenRouterClient client = new OpenRouterClient(props(base, "sk-test"), mapper);

            assertThatThrownBy(() ->
                            client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), t -> {}))
                    .isInstanceOf(ResponseStatusException.class);

            assertThat(requests.get())
                    .describedAs("HTTP %d cannot succeed on a second attempt; it must not be retried", status)
                    .isEqualTo(1);
            stopServer();
        }
    }

    /** Retries are bounded: a permanently rate-limited upstream must still return an error. */
    @Test
    void retriesAreBoundedAndTheLastFailureIsReported() throws Exception {
        String base = startSequence(new Canned(429, "application/json", "{\"error\":\"rate limited\"}"));
        OpenRouterClient client = new OpenRouterClient(props(base, "sk-test"), mapper);

        assertThatThrownBy(() -> client.streamReply(List.of(new OpenRouterClient.Turn("user", "hi")), t -> {}))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(requests.get()).isEqualTo(3);
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
        return startSequence(new Canned(status, contentType, body));
    }

    /** One scripted response. */
    private record Canned(int status, String contentType, String body) {}

    /**
     * How many times the client actually called upstream. This is the assertion that makes the
     * retry tests meaningful: a test that only checks the final answer passes just as happily when
     * the client silently hammers a dead endpoint, or when it never retries at all.
     */
    private final java.util.concurrent.atomic.AtomicInteger requests =
            new java.util.concurrent.atomic.AtomicInteger();

    /**
     * Serves the given responses in order, repeating the last one for any further requests.
     *
     * <p>Repeating rather than 404ing the overflow matters: it means a client that retries too many
     * times keeps getting the same failure instead of a confusingly different one, so
     * {@code requests} stays the thing under test.
     */
    private String startSequence(Canned... script) throws Exception {
        requests.set(0);
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/chat/completions", exchange -> {
            int n = requests.getAndIncrement();
            Canned canned = script[Math.min(n, script.length - 1)];
            byte[] bytes = canned.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", canned.contentType());
            exchange.sendResponseHeaders(canned.status(), 0); // 0 => chunked, like a real stream
            try (var os = exchange.getResponseBody()) {
                os.write(bytes);
                os.flush();
            }
        });
        server.start();
        return "http://localhost:" + server.getAddress().getPort();
    }
}
