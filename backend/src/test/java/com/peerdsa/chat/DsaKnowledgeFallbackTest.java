package com.peerdsa.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DsaKnowledgeFallbackTest {

    private DsaKnowledgeFallback fallback;

    @BeforeEach
    void setUp() {
        fallback = new DsaKnowledgeFallback();
    }

    @Test
    void greetingQueryReturnsGrindBuddyIntroduction() {
        String res = fallback.buildResponse("hello");
        assertThat(res).contains("Grind Buddy").contains("Two Sum");
    }

    @Test
    void twoSumQueryReturnsOptimalHashSolution() {
        String res = fallback.buildResponse("Can you explain two sum?");
        assertThat(res)
                .contains("Two Sum")
                .contains("Hash Map")
                .contains("O(N)")
                .contains("twoSum");
    }

    @Test
    void slidingWindowQueryReturnsUniversalTemplate() {
        String res = fallback.buildResponse("give me a sliding window template");
        assertThat(res)
                .contains("Sliding Window")
                .contains("while (windowIsInvalid())");
    }

    @Test
    void streamReplyEmitsTokensAndReturnsFullContent() {
        List<String> tokens = new ArrayList<>();
        List<OpenRouterClient.Turn> turns = List.of(
                new OpenRouterClient.Turn("user", "Explain 3Sum approach")
        );

        String full = fallback.streamReply(turns, tokens::add);

        assertThat(full).contains("3Sum").contains("Two Pointers");
        assertThat(tokens).isNotEmpty();
        assertThat(String.join("", tokens)).isEqualTo(full);
    }
}
