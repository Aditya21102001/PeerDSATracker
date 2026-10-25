package com.peerdsa.hire;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Ingests 100% REAL live software engineering job openings from authentic public career APIs:
 * <ul>
 *   <li><b>Arbeitnow API:</b> Real live verified engineering and tech postings from active hiring companies.</li>
 *   <li><b>Remotive API:</b> Live global and remote developer jobs with active application links.</li>
 * </ul>
 *
 * Automatically inspects postings for direct hiring emails (e.g., careers@..., jobs@...) to enable
 * genuine transactional application dispatch, or links to external ATS portals (Greenhouse, Lever, etc.)
 * with deep application metadata.
 */
@Service
public class RealJobAggregatorService {

    private static final Logger log = LoggerFactory.getLogger(RealJobAggregatorService.class);

    private static final String ARBEITNOW_API = "https://www.arbeitnow.com/api/job-board-api";
    private static final String REMOTIVE_API = "https://remotive.com/api/remote-jobs?category=software-dev&limit=40";

    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,6}\\b",
            Pattern.CASE_INSENSITIVE
    );

    private static final String[] TECH_KEYWORDS = {
        "Java", "Spring Boot", "Microservices", "Python", "FastAPI", "Django", "Angular",
        "React", "TypeScript", "JavaScript", "SQL", "PostgreSQL", "MySQL", "MongoDB",
        "Redis", "Kafka", "Docker", "Kubernetes", "AWS", "Azure", "GCP", "REST APIs",
        "DSA", "System Design", "C++", "Golang", "Git", "CI/CD", "Linux"
    };

    private final JobOpeningRepository jobRepo;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    @Autowired
    public RealJobAggregatorService(JobOpeningRepository jobRepo, ObjectMapper mapper) {
        this.jobRepo = jobRepo;
        this.mapper = mapper != null ? mapper : new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(15))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /**
     * Seeds initial batch of real jobs if repository has no live API jobs.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        try {
            long existingRealJobs = jobRepo.countBySource("ARBEITNOW") + jobRepo.countBySource("REMOTIVE");
            if (existingRealJobs < 10) {
                log.info("Bootstrapping live real jobs from authentic job boards...");
                syncAllRealJobs();
            }
        } catch (Exception e) {
            log.warn("Non-fatal startup job sync deferral: {}", e.getMessage());
        }
    }

    /**
     * Synchronizes live jobs from Arbeitnow and Remotive in real time.
     *
     * @return Number of newly added real jobs
     */
    @Transactional
    public int syncAllRealJobs() {
        int added = 0;
        try {
            added += syncArbeitnowJobs();
        } catch (Exception e) {
            log.error("Failed fetching live jobs from Arbeitnow: {}", e.getMessage());
        }

        try {
            added += syncRemotiveJobs();
        } catch (Exception e) {
            log.error("Failed fetching live jobs from Remotive: {}", e.getMessage());
        }

        log.info("Live real job sync complete. Added {} new openings.", added);
        return added;
    }

    /**
     * Fetches real jobs from Arbeitnow public REST API.
     */
    public int syncArbeitnowJobs() {
        List<JobOpening> newJobs = new ArrayList<>();
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(ARBEITNOW_API))
                    .header("Accept", "application/json")
                    .header("User-Agent", "PeerDSATracker-CareerEngine/1.0")
                    .timeout(Duration.ofSeconds(20))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Arbeitnow API returned HTTP {}", response.statusCode());
                return 0;
            }

            JsonNode root = mapper.readTree(response.body());
            JsonNode dataArray = root.path("data");
            if (!dataArray.isArray()) {
                return 0;
            }

            for (JsonNode item : dataArray) {
                String title = item.path("title").asText("").trim();
                String company = item.path("company_name").asText("").trim();
                String url = item.path("url").asText("").trim();
                String rawDesc = item.path("description").asText("");
                String location = item.path("location").asText("Remote").trim();
                boolean isRemote = item.path("remote").asBoolean(true);

                if (title.isBlank() || company.isBlank() || url.isBlank()) {
                    continue;
                }

                if (jobRepo.existsByExternalApplyUrl(url)) {
                    continue;
                }

                // Filter for tech/software engineering roles
                if (!isSoftwareRole(title, rawDesc)) {
                    continue;
                }

                JobOpening job = new JobOpening();
                job.setTitle(title);
                job.setCompany(company);
                job.setExternalApplyUrl(url);
                job.setLocation(location.isBlank() ? (isRemote ? "Remote / Worldwide" : "Hybrid") : location);
                job.setWorkplaceType(isRemote ? "REMOTE" : "HYBRID");
                job.setJobType("FULL_TIME");
                job.setCompanyLogoUrl(generateCompanyLogoUrl(company));
                job.setSource("ARBEITNOW");

                // Clean and truncate description if needed
                String cleanDesc = stripHtml(rawDesc);
                job.setDescription(cleanDesc.length() > 3000 ? cleanDesc.substring(0, 3000) + "..." : cleanDesc);

                // Check for direct email application
                String directEmail = extractDirectEmail(rawDesc, company);
                if (!directEmail.isBlank()) {
                    job.setContactEmail(directEmail);
                    job.setApplyType("EMAIL");
                } else {
                    job.setApplyType("ATS_PORTAL");
                }

                // Extract tags/skills
                Set<String> skills = new HashSet<>();
                JsonNode tagsNode = item.path("tags");
                if (tagsNode.isArray()) {
                    for (JsonNode tag : tagsNode) {
                        String t = tag.asText("").trim();
                        if (!t.isBlank()) {
                            skills.add(t);
                        }
                    }
                }
                skills.addAll(extractKeywords(title + " " + cleanDesc));
                if (skills.isEmpty()) {
                    skills.addAll(Arrays.asList("Java", "Spring Boot", "DSA", "SQL", "Git"));
                }
                job.setRequiredSkills(String.join(", ", skills));

                // Experience estimation
                int[] expRange = estimateExperience(title, cleanDesc);
                job.setExperienceMin(expRange[0]);
                job.setExperienceMax(expRange[1]);
                job.setSalaryRange("Competitive / Market Rate");
                job.setPostedAt(Instant.now());

                newJobs.add(job);
                if (newJobs.size() >= 25) {
                    break;
                }
            }

            if (!newJobs.isEmpty()) {
                jobRepo.saveAll(newJobs);
            }
        } catch (Exception e) {
            log.error("Error ingesting Arbeitnow jobs: {}", e.getMessage());
        }
        return newJobs.size();
    }

    /**
     * Fetches real jobs from Remotive public REST API.
     */
    public int syncRemotiveJobs() {
        List<JobOpening> newJobs = new ArrayList<>();
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(REMOTIVE_API))
                    .header("Accept", "application/json")
                    .header("User-Agent", "PeerDSATracker-CareerEngine/1.0")
                    .timeout(Duration.ofSeconds(20))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Remotive API returned HTTP {}", response.statusCode());
                return 0;
            }

            JsonNode root = mapper.readTree(response.body());
            JsonNode jobsArray = root.path("jobs");
            if (!jobsArray.isArray()) {
                return 0;
            }

            for (JsonNode item : jobsArray) {
                String title = item.path("title").asText("").trim();
                String company = item.path("company_name").asText("").trim();
                String url = item.path("url").asText("").trim();
                String rawDesc = item.path("description").asText("");
                String logo = item.path("company_logo").asText("");
                String location = item.path("candidate_required_location").asText("Worldwide").trim();
                String salary = item.path("salary").asText("").trim();

                if (title.isBlank() || company.isBlank() || url.isBlank()) {
                    continue;
                }

                if (jobRepo.existsByExternalApplyUrl(url)) {
                    continue;
                }

                JobOpening job = new JobOpening();
                job.setTitle(title);
                job.setCompany(company);
                job.setExternalApplyUrl(url);
                job.setLocation(location.isBlank() ? "Remote / Worldwide" : location);
                job.setWorkplaceType("REMOTE");
                job.setJobType("FULL_TIME");
                job.setCompanyLogoUrl(!logo.isBlank() ? logo : generateCompanyLogoUrl(company));
                job.setSource("REMOTIVE");
                job.setSalaryRange(!salary.isBlank() ? salary : "Competitive (Remote)");

                String cleanDesc = stripHtml(rawDesc);
                job.setDescription(cleanDesc.length() > 3000 ? cleanDesc.substring(0, 3000) + "..." : cleanDesc);

                String directEmail = extractDirectEmail(rawDesc, company);
                if (!directEmail.isBlank()) {
                    job.setContactEmail(directEmail);
                    job.setApplyType("EMAIL");
                } else {
                    job.setApplyType("ATS_PORTAL");
                }

                Set<String> skills = new HashSet<>();
                JsonNode tagsNode = item.path("tags");
                if (tagsNode.isArray()) {
                    for (JsonNode tag : tagsNode) {
                        String t = tag.asText("").trim();
                        if (!t.isBlank()) {
                            skills.add(t);
                        }
                    }
                }
                skills.addAll(extractKeywords(title + " " + cleanDesc));
                if (skills.isEmpty()) {
                    skills.addAll(Arrays.asList("Java", "Spring Boot", "REST APIs", "DSA", "Docker"));
                }
                job.setRequiredSkills(String.join(", ", skills));

                int[] expRange = estimateExperience(title, cleanDesc);
                job.setExperienceMin(expRange[0]);
                job.setExperienceMax(expRange[1]);
                job.setPostedAt(Instant.now());

                newJobs.add(job);
                if (newJobs.size() >= 25) {
                    break;
                }
            }

            if (!newJobs.isEmpty()) {
                jobRepo.saveAll(newJobs);
            }
        } catch (Exception e) {
            log.error("Error ingesting Remotive jobs: {}", e.getMessage());
        }
        return newJobs.size();
    }

    private boolean isSoftwareRole(String title, String desc) {
        String lower = (title + " " + desc).toLowerCase();
        return lower.contains("engineer") || lower.contains("developer")
                || lower.contains("architect") || lower.contains("programmer")
                || lower.contains("backend") || lower.contains("frontend")
                || lower.contains("full stack") || lower.contains("fullstack")
                || lower.contains("software") || lower.contains("devops");
    }

    private String extractDirectEmail(String text, String company) {
        if (text == null) return "";
        Matcher m = EMAIL_PATTERN.matcher(text);
        while (m.find()) {
            String email = m.group().toLowerCase();
            // Ignore generic marketing/tracking addresses
            if (email.contains("careers@") || email.contains("jobs@") || email.contains("hiring@")
                    || email.contains("hr@") || email.contains("apply@") || email.contains("recruiting@")) {
                return email;
            }
        }
        return "";
    }

    private Set<String> extractKeywords(String text) {
        Set<String> matches = new HashSet<>();
        for (String kw : TECH_KEYWORDS) {
            Pattern p = Pattern.compile("\\b" + Pattern.quote(kw) + "\\b", Pattern.CASE_INSENSITIVE);
            if (p.matcher(text).find()) {
                matches.add(kw);
            }
        }
        return matches;
    }

    private int[] estimateExperience(String title, String desc) {
        String lower = title.toLowerCase();
        if (lower.contains("senior") || lower.contains("sr.") || lower.contains("lead") || lower.contains("staff")) {
            return new int[]{3, 8};
        } else if (lower.contains("junior") || lower.contains("entry") || lower.contains("intern") || lower.contains("associate")) {
            return new int[]{0, 2};
        } else if (lower.contains("architect") || lower.contains("principal") || lower.contains("manager")) {
            return new int[]{5, 12};
        }

        // Try regex scan for "X years"
        Matcher m = Pattern.compile("(\\d+)\\+?\\s*(?:years?|yrs)", Pattern.CASE_INSENSITIVE).matcher(desc);
        if (m.find()) {
            try {
                int exp = Integer.parseInt(m.group(1));
                return new int[]{Math.max(0, exp - 1), exp + 3};
            } catch (Exception ignored) {}
        }

        return new int[]{1, 5};
    }

    private String stripHtml(String html) {
        if (html == null || html.isBlank()) return "";
        return html.replaceAll("<[^>]*>", " ")
                .replaceAll("&nbsp;", " ")
                .replaceAll("&amp;", "&")
                .replaceAll("&quot;", "\"")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String generateCompanyLogoUrl(String company) {
        String clean = company.replaceAll("[^a-zA-Z0-9]", "").toLowerCase();
        return "https://ui-avatars.com/api/?name=" + clean + "&background=6366f1&color=ffffff&bold=true&size=128";
    }
}
