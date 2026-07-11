package com.peerdsa.analytics;

import com.peerdsa.analytics.AnalyticsDtos.CodeforcesStats;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteRequest;
import com.peerdsa.analytics.AnalyticsDtos.ExecuteResult;
import com.peerdsa.analytics.AnalyticsDtos.FetchRequest;
import com.peerdsa.analytics.AnalyticsDtos.LeetCodeStats;
import com.peerdsa.analytics.AnalyticsDtos.ReviseNextRequest;
import com.peerdsa.analytics.AnalyticsDtos.ReviseNextResponse;
import com.peerdsa.analytics.AnalyticsDtos.WeaknessRequest;
import com.peerdsa.analytics.AnalyticsDtos.WeaknessResponse;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * The only caller of the FastAPI service. Authenticates with a shared secret;
 * the service is never exposed publicly.
 */
@Component
public class AnalyticsClient {

    private final RestClient client;

    public AnalyticsClient(
            RestClient.Builder builder,
            @Value("${app.analytics.base-url}") String baseUrl,
            @Value("${app.analytics.internal-token}") String internalToken,
            @Value("${app.analytics.connect-timeout}") Duration connectTimeout,
            @Value("${app.analytics.read-timeout}") Duration readTimeout) {

        // Spring Boot 4's default JDK HttpClient negotiates HTTP/2, which over plaintext
        // means an h2c upgrade (Upgrade: h2c + HTTP2-Settings). uvicorn's h11 server does
        // not support it, and the request body is silently dropped -- FastAPI then rejects
        // the call with "field required, input: null". Pin HTTP/1.1.
        HttpClient httpClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(connectTimeout)
                .build();

        var requestFactory = new JdkClientHttpRequestFactory(httpClient);
        // Generous: this covers both a real LeetCode/Codeforces round trip and, in
        // production, a cold start of the analytics service itself.
        requestFactory.setReadTimeout(readTimeout);

        this.client = builder
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader("X-Internal-Token", internalToken)
                .build();
    }

    public WeaknessResponse weakness(WeaknessRequest request) {
        return post("/analytics/weakness", request, WeaknessResponse.class);
    }

    public ReviseNextResponse reviseNext(ReviseNextRequest request) {
        return post("/analytics/revise-next", request, ReviseNextResponse.class);
    }

    public LeetCodeStats fetchLeetCode(String handle) {
        return post("/fetch/leetcode", new FetchRequest(handle), LeetCodeStats.class);
    }

    public CodeforcesStats fetchCodeforces(String handle) {
        return post("/fetch/codeforces", new FetchRequest(handle), CodeforcesStats.class);
    }

    /** Runs user code in Piston's sandbox via the FastAPI proxy; this JVM never executes it. */
    public ExecuteResult execute(ExecuteRequest request) {
        return post("/execute", request, ExecuteResult.class);
    }

    private <T> T post(String path, Object body, Class<T> responseType) {
        return client.post().uri(path).body(body).retrieve().body(responseType);
    }
}
