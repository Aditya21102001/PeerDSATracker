package com.peerdsa.hire;

import com.peerdsa.chat.OpenRouterClient;
import com.peerdsa.hire.HireDtos.ApplyAllResult;
import com.peerdsa.hire.HireDtos.CandidateProfileDto;
import com.peerdsa.hire.HireDtos.ExtractedProfileDto;
import com.peerdsa.hire.HireDtos.JobApplicationDto;
import com.peerdsa.hire.HireDtos.JobOpeningDto;
import com.peerdsa.hire.HireDtos.SaveCandidateProfileRequest;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
public class HireService {

    private static final Logger log = LoggerFactory.getLogger(HireService.class);

    private final CandidateProfileRepository profiles;
    private final JobOpeningRepository jobs;
    private final JobApplicationRepository applications;
    private final UserRepository users;
    private final OpenRouterClient openRouter;
    private final ObjectMapper mapper;

    @Autowired
    public HireService(
            CandidateProfileRepository profiles,
            JobOpeningRepository jobs,
            JobApplicationRepository applications,
            UserRepository users,
            ObjectProvider<OpenRouterClient> openRouterProvider,
            ObjectMapper mapper) {
        this.profiles = profiles;
        this.jobs = jobs;
        this.applications = applications;
        this.users = users;
        this.openRouter = openRouterProvider != null ? openRouterProvider.getIfAvailable() : null;
        this.mapper = mapper != null ? mapper : new ObjectMapper();
    }

    public HireService(
            CandidateProfileRepository profiles,
            JobOpeningRepository jobs,
            JobApplicationRepository applications,
            UserRepository users) {
        this(profiles, jobs, applications, users, null, new ObjectMapper());
    }

    @Transactional(readOnly = true)
    public CandidateProfileDto getProfile(Long userId) {
        CandidateProfile p = profiles.findByUserId(userId).orElse(null);
        if (p == null) {
            User u = users.findById(userId).orElseThrow(
                    () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
            return new CandidateProfileDto(
                    "Software Engineer | DSA & Problem Solving Practitioner",
                    2.0,
                    "",
                    "Software Engineer",
                    "",
                    "",
                    30,
                    "Bengaluru, Remote, Pune, Hyderabad",
                    "",
                    "",
                    "Java, Spring Boot, DSA, SQL, Angular, REST APIs, Git",
                    "",
                    "",
                    Instant.now(),
                    40);
        }
        return toDto(p);
    }

    @Transactional
    public CandidateProfileDto saveProfile(Long userId, SaveCandidateProfileRequest req) {
        User user = users.findById(userId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        CandidateProfile p = profiles.findByUserId(userId).orElseGet(() -> new CandidateProfile(user));

        if (req != null) {
            if (req.headline() != null) p.setHeadline(req.headline().trim());
            if (req.yearsOfExperience() != null) {
                double yoe = Math.max(0.0, Math.min(60.0, req.yearsOfExperience()));
                p.setYearsOfExperience(Math.round(yoe * 10.0) / 10.0);
            }
            if (req.currentCompany() != null) p.setCurrentCompany(req.currentCompany().trim());
            if (req.currentRole() != null) p.setCurrentRole(req.currentRole().trim());
            if (req.currentCtc() != null) p.setCurrentCtc(req.currentCtc().trim());
            if (req.expectedCtc() != null) p.setExpectedCtc(req.expectedCtc().trim());
            if (req.noticePeriodDays() != null) {
                int np = Math.max(0, Math.min(365, req.noticePeriodDays()));
                p.setNoticePeriodDays(np);
            }
            if (req.preferredLocations() != null) p.setPreferredLocations(req.preferredLocations().trim());
            if (req.resumeUrl() != null) p.setResumeUrl(req.resumeUrl().trim());
            if (req.resumeSummary() != null) p.setResumeSummary(req.resumeSummary().trim());
            if (req.skills() != null) p.setSkills(req.skills().trim());
            if (req.certifications() != null) p.setCertifications(req.certifications().trim());
            if (req.education() != null) p.setEducation(req.education().trim());
        }

        p.setUpdatedAt(Instant.now());
        p = profiles.save(p);
        return toDto(p);
    }

    /**
     * Extracts structured candidate profile data from raw resume text using LLM or smart heuristic parser.
     */
    public ExtractedProfileDto extractProfileFromResume(String resumeText) {
        if (resumeText == null || resumeText.isBlank()) {
            return new ExtractedProfileDto(
                    "Software Engineer",
                    2.0,
                    "",
                    "Software Engineer",
                    "",
                    "",
                    30,
                    "Bengaluru, Remote, Pune",
                    "Java, Spring Boot, DSA, SQL, Git",
                    "",
                    "B.Tech in Computer Science",
                    "Engineering professional with experience in software development and problem solving."
            );
        }

        // Try OpenRouter AI first if configured
        if (openRouter != null && openRouter.isConfigured()) {
            try {
                String systemPrompt = "You are an expert technical recruiter and resume parser. Given a candidate's resume, extract their profile as a valid JSON object with EXACT keys: "
                        + "\"headline\" (string, concise technical headline), "
                        + "\"yearsOfExperience\" (number), "
                        + "\"currentCompany\" (string), "
                        + "\"currentRole\" (string), "
                        + "\"currentCtc\" (string), "
                        + "\"expectedCtc\" (string), "
                        + "\"noticePeriodDays\" (integer), "
                        + "\"preferredLocations\" (string), "
                        + "\"skills\" (string, comma-separated list of technical skills), "
                        + "\"certifications\" (string), "
                        + "\"education\" (string), "
                        + "\"resumeSummary\" (string, 2-3 sentence executive summary). "
                        + "Return ONLY the JSON object with no markdown backticks.";

                String reply = openRouter.complete(systemPrompt, resumeText);
                if (reply != null && reply.contains("{") && reply.contains("}")) {
                    int start = reply.indexOf('{');
                    int end = reply.lastIndexOf('}') + 1;
                    Map<String, Object> map = mapper.readValue(reply.substring(start, end), new TypeReference<>() {});

                    String headline = (String) map.getOrDefault("headline", "Software Engineer");
                    double yoe = map.get("yearsOfExperience") instanceof Number n ? n.doubleValue() : 2.0;
                    String company = (String) map.getOrDefault("currentCompany", "");
                    String role = (String) map.getOrDefault("currentRole", "Software Engineer");
                    String ctc = (String) map.getOrDefault("currentCtc", "");
                    String expCtc = (String) map.getOrDefault("expectedCtc", "");
                    int notice = map.get("noticePeriodDays") instanceof Number n ? n.intValue() : 30;
                    String loc = (String) map.getOrDefault("preferredLocations", "Bengaluru, Remote");
                    String skills = (String) map.getOrDefault("skills", "");
                    String certs = (String) map.getOrDefault("certifications", "");
                    String edu = (String) map.getOrDefault("education", "");
                    String summary = (String) map.getOrDefault("resumeSummary", "");

                    return new ExtractedProfileDto(
                            headline,
                            Math.max(0.0, Math.min(50.0, yoe)),
                            company,
                            role,
                            ctc,
                            expCtc,
                            Math.max(0, Math.min(180, notice)),
                            loc,
                            skills,
                            certs,
                            edu,
                            summary
                    );
                }
            } catch (Exception e) {
                log.warn("AI resume extraction fallback triggered: {}", e.getMessage());
            }
        }

        // Smart Heuristic Domain Extractor Fallback
        return extractWithHeuristics(resumeText);
    }

    private ExtractedProfileDto extractWithHeuristics(String text) {
        String lower = text.toLowerCase();

        // 1. Extract Experience
        double yoe = 2.5;
        Matcher mExp = Pattern.compile("(\\d+(?:\\.\\d+)?)\\+?\\s*(?:years?|yrs)", Pattern.CASE_INSENSITIVE).matcher(text);
        if (mExp.find()) {
            try {
                yoe = Double.parseDouble(mExp.group(1));
            } catch (Exception ignored) {}
        }

        // 2. Extract Skills
        String[] skillCatalog = {
            "Java", "Spring Boot", "Microservices", "Spring Security", "JPA", "Hibernate",
            "Python", "FastAPI", "Django", "Flask", "C++", "JavaScript", "TypeScript",
            "Angular", "React", "Node.js", "SQL", "PostgreSQL", "MySQL", "MongoDB",
            "Redis", "Kafka", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
            "Git", "REST APIs", "DSA", "System Design", "CI/CD", "Linux"
        };
        List<String> matchedSkills = new ArrayList<>();
        for (String skill : skillCatalog) {
            Pattern p = Pattern.compile("\\b" + Pattern.quote(skill) + "\\b", Pattern.CASE_INSENSITIVE);
            if (p.matcher(text).find()) {
                matchedSkills.add(skill);
            }
        }
        String skillsStr = matchedSkills.isEmpty()
                ? "Java, Spring Boot, Microservices, SQL, Git, REST APIs"
                : String.join(", ", matchedSkills);

        // 3. Extract Role & Company
        String role = "Software Engineer";
        if (lower.contains("senior software engineer") || lower.contains("senior backend") || lower.contains("sde 2") || lower.contains("sde ii")) {
            role = "Senior Software Engineer";
        } else if (lower.contains("lead") || lower.contains("architect")) {
            role = "Technical Lead / Architect";
        } else if (lower.contains("backend developer") || lower.contains("backend engineer")) {
            role = "Backend Software Engineer";
        } else if (lower.contains("full stack") || lower.contains("fullstack")) {
            role = "Full Stack Engineer";
        }

        String company = "";
        String[] commonCompanies = {"TCS", "Tata Consultancy Services", "Infosys", "Wipro", "Accenture", "Cognizant", "Capgemini", "Amazon", "Microsoft", "Google", "Oracle", "Swiggy", "Zomato", "PhonePe", "Paytm", "HCL", "Tech Mahindra"};
        for (String c : commonCompanies) {
            if (Pattern.compile("\\b" + Pattern.quote(c) + "\\b", Pattern.CASE_INSENSITIVE).matcher(text).find()) {
                company = c;
                break;
            }
        }

        // 4. Extract Education
        String education = "B.Tech in Computer Science";
        if (lower.contains("m.tech")) education = "M.Tech in Computer Science";
        else if (lower.contains("mca")) education = "Master of Computer Applications (MCA)";
        else if (lower.contains("b.e.") || lower.contains("bachelor of engineering")) education = "B.E. in Computer Engineering";
        else if (lower.contains("b.sc")) education = "B.Sc in Computer Science";

        // 5. Extract Certifications
        List<String> certs = new ArrayList<>();
        if (lower.contains("aws certified")) certs.add("AWS Certified Developer");
        if (lower.contains("oracle certified") || lower.contains("ocp")) certs.add("Oracle Certified Java SE Developer");
        if (lower.contains("kubernetes") || lower.contains("cka")) certs.add("Certified Kubernetes Administrator (CKA)");
        String certsStr = String.join(", ", certs);

        // 6. Build Headline & Summary
        String headline = String.format("%s | %s", role, matchedSkills.stream().limit(4).collect(Collectors.joining(", ")));
        String summary = String.format(
                "Software engineering professional with %.1f+ years of experience in building scalable backend systems, microservices, and high-performance APIs with %s.",
                yoe, matchedSkills.stream().limit(3).collect(Collectors.joining(", "))
        );

        return new ExtractedProfileDto(
                headline,
                yoe,
                company,
                role,
                "₹12 LPA",
                "₹24 LPA",
                30,
                "Bengaluru, Remote, Pune, Hyderabad",
                skillsStr,
                certsStr,
                education,
                summary
        );
    }

    @Transactional(readOnly = true)
    public List<JobOpeningDto> listJobs(Long userId) {
        User user = users.findById(userId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        CandidateProfile profile = profiles.findByUserId(userId).orElse(null);
        List<JobOpening> allJobs = jobs.findByIsActiveTrueOrderByPostedAtDesc();
        List<JobApplication> userApps = applications.findAllByUserId(userId);

        Map<Long, JobApplication> appByJobId = new HashMap<>();
        for (JobApplication app : userApps) {
            appByJobId.put(app.getJob().getId(), app);
        }

        List<JobOpeningDto> results = new ArrayList<>();
        for (JobOpening job : allJobs) {
            MatchAnalysis analysis = computeMatch(profile, user, job);
            JobApplication app = appByJobId.get(job.getId());
            boolean isApplied = app != null;
            String status = app != null ? app.getStatus() : null;
            Instant appliedAt = app != null ? app.getAppliedAt() : null;

            results.add(new JobOpeningDto(
                    job.getId(),
                    job.getTitle(),
                    job.getCompany(),
                    job.getCompanyLogoUrl(),
                    job.getLocation(),
                    job.getExperienceMin(),
                    job.getExperienceMax(),
                    job.getSalaryRange(),
                    job.getJobType(),
                    job.getWorkplaceType(),
                    job.getRequiredSkills(),
                    job.getDescription(),
                    job.getExternalApplyUrl(),
                    job.getPostedAt(),
                    analysis.score(),
                    analysis.matchingSkills(),
                    analysis.missingSkills(),
                    isApplied,
                    status,
                    appliedAt));
        }

        // Sort: Non-applied first, then highest match score, then most recent
        results.sort(Comparator
                .comparing(JobOpeningDto::isApplied)
                .thenComparing((JobOpeningDto j) -> -j.matchScore())
                .thenComparing(JobOpeningDto::postedAt, Comparator.reverseOrder()));

        return results;
    }

    /**
     * Executes a 1-Click Application for a candidate to a specific job opening.
     *
     * <p><b>How this works:</b>
     * <ul>
     *   <li>Calculates a dynamic ATS match score based on candidate skills, experience, and PeerDSA solve count.</li>
     *   <li>Persists an application record in the PostgreSQL {@code job_applications} table linked to the candidate.</li>
     *   <li>Tracks status in the in-app ATS pipeline ({@code APPLIED} &rarr; {@code UNDER_REVIEW} &rarr; {@code SHORTLISTED} &rarr; etc.).</li>
     *   <li><b>Note on external portals:</b> Third-party corporate systems (e.g. Amazon, Swiggy) do not offer open APIs
     *       for third-party submission bots. The job entity retains {@code externalApplyUrl} so candidates can also
     *       access the official corporate portal directly from the details modal.</li>
     * </ul>
     */
    @Transactional
    public JobApplicationDto apply(Long userId, Long jobId) {
        User user = users.findById(userId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        JobOpening job = jobs.findById(jobId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Job opening not found"));

        var existing = applications.findByUserIdAndJobId(userId, jobId);
        if (existing.isPresent()) {
            return toDto(existing.get());
        }

        CandidateProfile profile = profiles.findByUserId(userId).orElse(null);
        MatchAnalysis analysis = computeMatch(profile, user, job);

        JobApplication app = new JobApplication(user, job, analysis.score());
        app = applications.save(app);
        return toDto(app);
    }

    /**
     * Naukri-grade 1-Click "Apply to All Matching" bulk applicator.
     *
     * <p>Scans all active openings, evaluates candidate compatibility, filters out previously applied roles,
     * and atomically batches all qualifying applications (default &ge; 70% match) into the database in one operation.
     */
    @Transactional
    public ApplyAllResult applyAllMatching(Long userId, Integer minScoreThreshold) {
        int threshold = (minScoreThreshold != null && minScoreThreshold >= 40 && minScoreThreshold <= 100)
                ? minScoreThreshold
                : 70;

        User user = users.findById(userId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        CandidateProfile profile = profiles.findByUserId(userId).orElse(null);
        List<JobOpening> allJobs = jobs.findByIsActiveTrueOrderByPostedAtDesc();
        List<JobApplication> userApps = applications.findAllByUserId(userId);

        Set<Long> alreadyAppliedJobIds = userApps.stream()
                .map(a -> a.getJob().getId())
                .collect(Collectors.toSet());

        List<JobApplication> newlyCreated = new ArrayList<>();
        int matchingCount = 0;

        for (JobOpening job : allJobs) {
            MatchAnalysis analysis = computeMatch(profile, user, job);
            if (analysis.score() >= threshold) {
                matchingCount++;
                if (!alreadyAppliedJobIds.contains(job.getId())) {
                    JobApplication app = new JobApplication(user, job, analysis.score());
                    newlyCreated.add(app);
                }
            }
        }

        if (!newlyCreated.isEmpty()) {
            newlyCreated = applications.saveAll(newlyCreated);
        }

        List<JobApplicationDto> dtos = newlyCreated.stream().map(this::toDto).toList();
        String message = newlyCreated.isEmpty()
                ? (matchingCount > 0
                        ? "You have already applied to all " + matchingCount + " jobs matching " + threshold + "% or above!"
                        : "No openings currently meet the " + threshold + "% match threshold. Try adding more skills to your profile.")
                : String.format("Successfully 1-click applied to %d matching jobs (>= %d%% match)!", newlyCreated.size(), threshold);

        return new ApplyAllResult(newlyCreated.size(), matchingCount, threshold, message, dtos);
    }

    @Transactional(readOnly = true)
    public List<JobApplicationDto> listApplications(Long userId) {
        return applications.findByUserIdOrderByAppliedAtDesc(userId).stream()
                .map(this::toDto)
                .toList();
    }

    // ----------------------------------------------------------- match scoring engine

    private record MatchAnalysis(int score, List<String> matchingSkills, List<String> missingSkills) {}

    /**
     * Calculates candidate-job compatibility using a three-tier weighted formula:
     * <ol>
     *   <li><b>Skills Overlap (60% weight):</b> Normalized token match between profile skills and job required skills.</li>
     *   <li><b>Experience Overlap (25% weight):</b> Compares candidate YOE against the role's min/max expectations.</li>
     *   <li><b>Platform Solve Bonus (15% weight):</b> Rewards candidates actively solving Striver DSA problems on PeerDSATracker.</li>
     * </ol>
     */

    private MatchAnalysis computeMatch(CandidateProfile profile, User user, JobOpening job) {
        List<String> requiredSkills = splitSkills(job.getRequiredSkills());
        if (requiredSkills.isEmpty()) {
            return new MatchAnalysis(75, Collections.emptyList(), Collections.emptyList());
        }

        Set<String> candidateSkills = new HashSet<>();
        double candidateYoe = 1.0;
        if (profile != null) {
            candidateSkills = splitSkills(profile.getSkills()).stream()
                    .map(String::toLowerCase)
                    .collect(Collectors.toSet());
            candidateYoe = profile.getYearsOfExperience();
        }

        List<String> matching = new ArrayList<>();
        List<String> missing = new ArrayList<>();

        for (String req : requiredSkills) {
            String norm = req.toLowerCase().trim();
            boolean match = candidateSkills.contains(norm)
                    || candidateSkills.stream().anyMatch(cs -> cs.contains(norm) || norm.contains(cs));
            if (match) {
                matching.add(req);
            } else {
                missing.add(req);
            }
        }

        // 1. Skills match (60% weight)
        double skillScore = ((double) matching.size() / requiredSkills.size()) * 60.0;

        // 2. Experience overlap (25% weight)
        double expScore;
        if (candidateYoe >= job.getExperienceMin() && candidateYoe <= job.getExperienceMax() + 1) {
            expScore = 25.0;
        } else if (candidateYoe >= Math.max(0, job.getExperienceMin() - 1)) {
            expScore = 18.0;
        } else {
            expScore = 8.0;
        }

        // 3. PeerDSATracker Activity Bonus (15% weight)
        int totalSolved = user.getTotalSolved();
        double dsaBonus = 5.0;
        if (totalSolved >= 50) {
            dsaBonus = 15.0;
        } else if (totalSolved >= 20) {
            dsaBonus = 12.0;
        } else if (totalSolved >= 5) {
            dsaBonus = 8.0;
        }

        int finalScore = (int) Math.round(skillScore + expScore + dsaBonus);
        finalScore = Math.min(99, Math.max(20, finalScore));

        return new MatchAnalysis(finalScore, matching, missing);
    }

    private List<String> splitSkills(String s) {
        if (s == null || s.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.stream(s.split("[,;\\n]+"))
                .map(String::trim)
                .filter(part -> !part.isEmpty())
                .collect(Collectors.toList());
    }

    private CandidateProfileDto toDto(CandidateProfile p) {
        int percent = 0;
        if (p.getHeadline() != null && !p.getHeadline().isBlank()) percent += 15;
        if (p.getYearsOfExperience() > 0) percent += 15;
        if (p.getSkills() != null && !p.getSkills().isBlank()) percent += 20;
        if ((p.getResumeUrl() != null && !p.getResumeUrl().isBlank())
                || (p.getResumeSummary() != null && !p.getResumeSummary().isBlank())) percent += 20;
        if (p.getCurrentRole() != null && !p.getCurrentRole().isBlank()) percent += 10;
        if (p.getCertifications() != null && !p.getCertifications().isBlank()) percent += 10;
        if (p.getEducation() != null && !p.getEducation().isBlank()) percent += 10;
        percent = Math.min(100, Math.max(20, percent));

        return new CandidateProfileDto(
                p.getHeadline(),
                p.getYearsOfExperience(),
                p.getCurrentCompany(),
                p.getCurrentRole(),
                p.getCurrentCtc(),
                p.getExpectedCtc(),
                p.getNoticePeriodDays(),
                p.getPreferredLocations(),
                p.getResumeUrl(),
                p.getResumeSummary(),
                p.getSkills(),
                p.getCertifications(),
                p.getEducation(),
                p.getUpdatedAt(),
                percent);
    }

    private JobApplicationDto toDto(JobApplication a) {
        return new JobApplicationDto(
                a.getId(),
                a.getJob().getId(),
                a.getJob().getTitle(),
                a.getJob().getCompany(),
                a.getJob().getCompanyLogoUrl(),
                a.getJob().getLocation(),
                a.getJob().getSalaryRange(),
                a.getStatus(),
                a.getMatchScore(),
                a.getAppliedAt(),
                a.getNotes());
    }
}
