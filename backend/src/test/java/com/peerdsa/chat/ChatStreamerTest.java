package com.peerdsa.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.peerdsa.config.OpenRouterProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class ChatStreamerTest {

    private ChatService chatService;
    private OpenRouterClient openRouter;
    private DsaKnowledgeFallback fallbackTutor;
    private ObjectMapper mapper;
    private OpenRouterProperties props;
    private ChatStreamer streamer;

    @BeforeEach
    void setUp() {
        chatService = mock(ChatService.class);
        openRouter = mock(OpenRouterClient.class);
        fallbackTutor = mock(DsaKnowledgeFallback.class);
        mapper = JsonMapper.builder().build();
        props = new OpenRouterProperties(
                "sk-test", "http://localhost", "m:free", "sys", 20,
                Duration.ofSeconds(1), Duration.ofSeconds(1), "r", "t");
        streamer = new ChatStreamer(chatService, openRouter, fallbackTutor, mapper, props);
    }

    @Test
    void streamEngagesFallbackWhenOpenRouterUnconfigured() throws Exception {
        when(openRouter.isConfigured()).thenReturn(false);
        ChatService.Prepared prepared = new ChatService.Prepared(
                42L,
                List.of(new OpenRouterClient.Turn("user", "Explain Two Sum"))
        );
        when(chatService.prepareTurn(eq(1L), any())).thenReturn(prepared);
        when(fallbackTutor.streamReply(eq(prepared.turns()), any()))
                .thenReturn("Two Sum explanation");

        SseEmitter emitter = streamer.stream(1L, new ChatDtos.SendRequest(null, "Explain Two Sum"));

        assertThat(emitter).isNotNull();
        // Give background thread a moment to execute
        Thread.sleep(150);

        verify(fallbackTutor).streamReply(eq(prepared.turns()), any());
        verify(chatService).appendAssistant(42L, "Two Sum explanation");
    }
}
