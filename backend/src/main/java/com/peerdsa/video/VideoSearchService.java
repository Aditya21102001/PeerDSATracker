package com.peerdsa.video;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.peerdsa.video.VideoDtos.VideoSearchResult;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VideoSearchService {

    private static final Logger log = LoggerFactory.getLogger(VideoSearchService.class);

    private static final Pattern YOUTUBE_URL_PATTERN = Pattern.compile(
            "(?:https?://)?(?:www\\.)?(?:youtube\\.com/(?:watch\\?v=|embed/)|youtu\\.be/)([a-zA-Z0-9_-]{11})");

    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String youtubeApiKey;

    private final Map<String, CacheEntry> searchCache = new ConcurrentHashMap<>();

    private record CacheEntry(List<VideoSearchResult> results, Instant expiresAt) {}

    public VideoSearchService(
            ObjectMapper objectMapper,
            @Value("${app.youtube.api-key:${YOUTUBE_API_KEY:}}") String youtubeApiKey) {
        this.objectMapper = objectMapper;
        this.youtubeApiKey = youtubeApiKey != null ? youtubeApiKey.trim() : "";
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(6))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /**
     * Search YouTube for videos or resolve a direct YouTube URL / video ID.
     */
    public List<VideoSearchResult> search(String query) {
        if (query == null || query.isBlank()) {
            return getCuratedRecommendations();
        }

        String trimmed = query.trim();

        // Check if query is a direct YouTube link or 11-char video ID
        Matcher matcher = YOUTUBE_URL_PATTERN.matcher(trimmed);
        if (matcher.find()) {
            String videoId = matcher.group(1);
            VideoSearchResult resolved = resolveSingleVideo(videoId);
            if (resolved != null) {
                return List.of(resolved);
            }
        } else if (trimmed.matches("^[a-zA-Z0-9_-]{11}$")) {
            VideoSearchResult resolved = resolveSingleVideo(trimmed);
            if (resolved != null) {
                return List.of(resolved);
            }
        }

        // Check in-memory cache
        String cacheKey = trimmed.toLowerCase();
        CacheEntry cached = searchCache.get(cacheKey);
        if (cached != null && cached.expiresAt().isAfter(Instant.now())) {
            return cached.results();
        }

        List<VideoSearchResult> results = new ArrayList<>();

        // Method 1: Official API if configured
        if (!youtubeApiKey.isEmpty()) {
            results.addAll(searchViaOfficialApi(trimmed));
        }

        // Method 2: Public YouTube HTML scraper if official API not present or yielded 0
        if (results.isEmpty()) {
            results.addAll(searchViaYouTubeScraper(trimmed));
        }

        // Method 3: Fallback to Curated DSA catalog matches if search failed or offline
        if (results.isEmpty()) {
            results.addAll(searchCuratedCatalog(trimmed));
        }

        // Cache valid results for 10 minutes
        if (!results.isEmpty()) {
            searchCache.put(cacheKey, new CacheEntry(results, Instant.now().plus(Duration.ofMinutes(10))));
        }

        return results;
    }

    /**
     * Fetch video title and author using YouTube's official free oEmbed endpoint.
     */
    public VideoSearchResult resolveSingleVideo(String videoId) {
        try {
            String url = "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + videoId + "&format=json";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("User-Agent", USER_AGENT)
                    .timeout(Duration.ofSeconds(4))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JsonNode json = objectMapper.readTree(response.body());
                String title = json.path("title").asText("YouTube Video");
                String author = json.path("author_name").asText("YouTube Creator");
                String thumbnail = json.path("thumbnail_url").asText("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg");

                return new VideoSearchResult(
                        videoId,
                        title,
                        author,
                        thumbnail,
                        "",
                        "",
                        "",
                        "youtube_direct");
            }
        } catch (Exception e) {
            log.warn("Failed to resolve oEmbed for video {}: {}", videoId, e.getMessage());
        }

        // Fallback default structure
        return new VideoSearchResult(
                videoId,
                "YouTube Video (" + videoId + ")",
                "YouTube",
                "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg",
                "",
                "",
                "",
                "youtube_fallback");
    }

    private List<VideoSearchResult> searchViaOfficialApi(String query) {
        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            String url = "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&type=video&q="
                    + encodedQuery + "&key=" + youtubeApiKey;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("User-Agent", USER_AGENT)
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JsonNode root = objectMapper.readTree(response.body());
                JsonNode items = root.path("items");
                List<VideoSearchResult> list = new ArrayList<>();
                for (JsonNode item : items) {
                    String videoId = item.path("id").path("videoId").asText();
                    if (!videoId.isEmpty()) {
                        JsonNode snippet = item.path("snippet");
                        String title = snippet.path("title").asText();
                        String channel = snippet.path("channelTitle").asText();
                        String thumb = snippet.path("thumbnails").path("medium").path("url")
                                .asText("https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg");
                        String published = snippet.path("publishedAt").asText();

                        list.add(new VideoSearchResult(videoId, title, channel, thumb, "", "", published, "official_api"));
                    }
                }
                return list;
            }
        } catch (Exception e) {
            log.warn("Official YouTube API search failed: {}", e.getMessage());
        }
        return Collections.emptyList();
    }

    private List<VideoSearchResult> searchViaYouTubeScraper(String query) {
        try {
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            String searchUrl = "https://www.youtube.com/results?search_query=" + encodedQuery;

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(searchUrl))
                    .header("User-Agent", USER_AGENT)
                    .header("Accept-Language", "en-US,en;q=0.9")
                    .timeout(Duration.ofSeconds(6))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                String html = response.body();
                int marker = html.indexOf("ytInitialData = {");
                if (marker == -1) {
                    marker = html.indexOf("var ytInitialData = {");
                    if (marker != -1) marker += 4;
                }

                if (marker != -1) {
                    int jsonStart = marker + "ytInitialData = ".length();
                    int jsonEnd = html.indexOf("};", jsonStart) + 1;
                    if (jsonEnd > jsonStart) {
                        String jsonStr = html.substring(jsonStart, jsonEnd);
                        JsonNode root = objectMapper.readTree(jsonStr);

                        JsonNode contents = root.path("contents")
                                .path("twoColumnSearchResultsRenderer")
                                .path("primaryContents")
                                .path("sectionListRenderer")
                                .path("contents");

                        List<VideoSearchResult> results = new ArrayList<>();
                        for (JsonNode section : contents) {
                            JsonNode itemSection = section.path("itemSectionRenderer").path("contents");
                            for (JsonNode item : itemSection) {
                                JsonNode video = item.path("videoRenderer");
                                if (!video.isMissingNode()) {
                                    String videoId = video.path("videoId").asText();
                                    if (videoId.length() == 11) {
                                        String title = video.path("title").path("runs").path(0).path("text").asText();
                                        if (title.isEmpty()) {
                                            title = video.path("headline").path("runs").path(0).path("text").asText("YouTube Video");
                                        }

                                        String channel = video.path("ownerText").path("runs").path(0).path("text").asText();
                                        if (channel.isEmpty()) {
                                            channel = video.path("shortBylineText").path("runs").path(0).path("text").asText("YouTube Creator");
                                        }

                                        String duration = video.path("lengthText").path("simpleText").asText("");
                                        String views = video.path("viewCountText").path("simpleText").asText("");
                                        String published = video.path("publishedTimeText").path("simpleText").asText("");
                                        String thumbnail = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";

                                        results.add(new VideoSearchResult(
                                                videoId,
                                                title,
                                                channel,
                                                thumbnail,
                                                duration,
                                                views,
                                                published,
                                                "youtube_live"));

                                        if (results.size() >= 25) {
                                            break;
                                        }
                                    }
                                }
                            }
                            if (results.size() >= 25) break;
                        }

                        if (!results.isEmpty()) {
                            return results;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("YouTube scraper search error for '{}': {}", query, e.getMessage());
        }
        return Collections.emptyList();
    }

    private List<VideoSearchResult> searchCuratedCatalog(String query) {
        String lower = query.toLowerCase();
        List<VideoSearchResult> matches = new ArrayList<>();
        for (VideoSearchResult v : CURATED_VIDEOS) {
            if (v.title().toLowerCase().contains(lower) || v.channelTitle().toLowerCase().contains(lower)) {
                matches.add(v);
            }
        }
        return matches.isEmpty() ? CURATED_VIDEOS.subList(0, Math.min(10, CURATED_VIDEOS.size())) : matches;
    }

    public List<VideoSearchResult> getCuratedRecommendations() {
        return CURATED_VIDEOS;
    }

    // High quality curated DSA & Tech tutorials for instant zero-latency experience
    private static final List<VideoSearchResult> CURATED_VIDEOS = List.of(
            new VideoSearchResult(
                    "UXDSeD9mN-k",
                    "2 Sum Problem | 2 Types of the Same Problem for Interviews | Brute-Better-Optimal",
                    "take U forward",
                    "https://i.ytimg.com/vi/UXDSeD9mN-k/hqdefault.jpg",
                    "24:18",
                    "640K views",
                    "Striver A2Z",
                    "curated"),
            new VideoSearchResult(
                    "sdE0A2Oxofw",
                    "DP 8. Grid Unique Paths | Learn Everything about DP on Grids | ALL TECHNIQUES",
                    "take U forward",
                    "https://i.ytimg.com/vi/sdE0A2Oxofw/hqdefault.jpg",
                    "22:45",
                    "520K views",
                    "Striver DP",
                    "curated"),
            new VideoSearchResult(
                    "KLlXCFG5TnA",
                    "Two Sum - Leetcode 1 - HashMap Approach",
                    "NeetCode",
                    "https://i.ytimg.com/vi/KLlXCFG5TnA/hqdefault.jpg",
                    "09:12",
                    "1.8M views",
                    "NeetCode 150",
                    "curated"),
            new VideoSearchResult(
                    "AHZpyQDEAlk",
                    "Kadane's Algorithm | Maximum Subarray Sum | Complete Intuition & Code",
                    "take U forward",
                    "https://i.ytimg.com/vi/AHZpyQDEAlk/hqdefault.jpg",
                    "19:30",
                    "480K views",
                    "Striver Arrays",
                    "curated"),
            new VideoSearchResult(
                    "V8qIqJxCioo",
                    "Kosaraju's Algorithm for Strongly Connected Components (SCC) | Graph Series",
                    "take U forward",
                    "https://i.ytimg.com/vi/V8qIqJxCioo/hqdefault.jpg",
                    "26:10",
                    "310K views",
                    "Striver Graph",
                    "curated"),
            new VideoSearchResult(
                    "aBxjDBC4M1U",
                    "Disjoint Set | Union by Rank | Path Compression | Complete Graph Masterclass",
                    "take U forward",
                    "https://i.ytimg.com/vi/aBxjDBC4M1U/hqdefault.jpg",
                    "28:50",
                    "420K views",
                    "Striver Graph",
                    "curated"),
            new VideoSearchResult(
                    "mLfjzJsN8us",
                    "Climbing Stairs | 1D Dynamic Programming | Memoization & Tabulation",
                    "take U forward",
                    "https://i.ytimg.com/vi/mLfjzJsN8us/hqdefault.jpg",
                    "16:40",
                    "390K views",
                    "Striver DP",
                    "curated"),
            new VideoSearchResult(
                    "xBC--Sdt-dI",
                    "System Design Interview: How to Design a Rate Limiter",
                    "ByteByteGo",
                    "https://i.ytimg.com/vi/xBC--Sdt-dI/hqdefault.jpg",
                    "14:20",
                    "890K views",
                    "System Design",
                    "curated"),
            new VideoSearchResult(
                    "bBC-nXj3Ng4",
                    "Java Concurrency & Multithreading Crash Course",
                    "FreeCodeCamp",
                    "https://i.ytimg.com/vi/bBC-nXj3Ng4/hqdefault.jpg",
                    "1:12:30",
                    "750K views",
                    "Java Internals",
                    "curated"),
            new VideoSearchResult(
                    "G4J6126n_xM",
                    "Spring Boot Full Course - Learn Microservices with Spring Boot 3",
                    "Amigoscode",
                    "https://i.ytimg.com/vi/G4J6126n_xM/hqdefault.jpg",
                    "2:45:10",
                    "1.2M views",
                    "Spring Boot",
                    "curated"),
            new VideoSearchResult(
                    "o-nCM6v6h0g",
                    "Angular 19 Full Course | Signals, Standalone Components & SSR",
                    "Academind",
                    "https://i.ytimg.com/vi/o-nCM6v6h0g/hqdefault.jpg",
                    "1:40:20",
                    "310K views",
                    "Angular",
                    "curated"),
            new VideoSearchResult(
                    "mJcZjjKzeqk",
                    "Prim's Algorithm - Minimum Spanning Tree | Graph Theory",
                    "take U forward",
                    "https://i.ytimg.com/vi/mJcZjjKzeqk/hqdefault.jpg",
                    "23:15",
                    "290K views",
                    "Striver Graph",
                    "curated")
    );
}
