package com.peerdsa.hire;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.peerdsa.hire.HireDtos.ApplyAllResult;
import com.peerdsa.hire.HireDtos.CandidateProfileDto;
import com.peerdsa.hire.HireDtos.JobApplicationDto;
import com.peerdsa.hire.HireDtos.JobOpeningDto;
import com.peerdsa.hire.HireDtos.SaveCandidateProfileRequest;
import com.peerdsa.user.User;
import com.peerdsa.user.UserRepository;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;

class HireServiceTest {

    private static final long USER_ID = 201L;

    private CandidateProfileRepository profiles;
    private JobOpeningRepository jobs;
    private JobApplicationRepository applications;
    private UserRepository users;
    private HireService hireService;

    private User user;
    private JobOpening jobAmazon;
    private JobOpening jobSwiggy;
    private JobOpening jobFrontend;

    @BeforeEach
    void setUp() throws Exception {
        profiles = mock(CandidateProfileRepository.class);
        jobs = mock(JobOpeningRepository.class);
        applications = mock(JobApplicationRepository.class);
        users = mock(UserRepository.class);

        hireService = new HireService(profiles, jobs, applications, users);

        user = new User();
        setField(user, "id", USER_ID);
        setField(user, "displayName", "Aditya");
        setField(user, "totalSolved", 45);

        jobAmazon = new JobOpening();
        setField(jobAmazon, "id", 1L);
        jobAmazon.setTitle("SDE-II");
        jobAmazon.setCompany("Amazon");
        jobAmazon.setRequiredSkills("Java, Spring Boot, Microservices, System Design, DSA");
        jobAmazon.setExperienceMin(2);
        jobAmazon.setExperienceMax(5);
        jobAmazon.setPostedAt(Instant.now());

        jobSwiggy = new JobOpening();
        setField(jobSwiggy, "id", 2L);
        jobSwiggy.setTitle("Backend Engineer");
        jobSwiggy.setCompany("Swiggy");
        jobSwiggy.setRequiredSkills("Java, Spring Boot, Kafka, Redis, PostgreSQL");
        jobSwiggy.setExperienceMin(2);
        jobSwiggy.setExperienceMax(6);
        jobSwiggy.setPostedAt(Instant.now());

        jobFrontend = new JobOpening();
        setField(jobFrontend, "id", 3L);
        jobFrontend.setTitle("Frontend Specialist");
        jobFrontend.setCompany("DesignLab");
        jobFrontend.setRequiredSkills("Vue, Nuxt, Figma, CSS Animations, UI Design");
        jobFrontend.setExperienceMin(5);
        jobFrontend.setExperienceMax(8);
        jobFrontend.setPostedAt(Instant.now());

        when(users.findById(USER_ID)).thenReturn(Optional.of(user));
        when(jobs.findByIsActiveTrueOrderByPostedAtDesc()).thenReturn(List.of(jobAmazon, jobSwiggy, jobFrontend));
        when(jobs.findById(1L)).thenReturn(Optional.of(jobAmazon));
        when(jobs.findById(2L)).thenReturn(Optional.of(jobSwiggy));

        when(applications.save(any())).thenAnswer((Answer<JobApplication>) i -> {
            JobApplication app = i.getArgument(0);
            setField(app, "id", 999L);
            return app;
        });

        when(applications.saveAll(any())).thenAnswer((Answer<List<JobApplication>>) i -> {
            List<JobApplication> list = i.getArgument(0);
            long id = 1000L;
            for (JobApplication a : list) {
                setField(a, "id", id++);
            }
            return list;
        });
    }

    @Test
    void getProfile_whenMissing_returnsStarterProfile() {
        when(profiles.findByUserId(USER_ID)).thenReturn(Optional.empty());

        CandidateProfileDto p = hireService.getProfile(USER_ID);

        assertThat(p).isNotNull();
        assertThat(p.headline()).contains("Software Engineer");
        assertThat(p.completenessPercent()).isGreaterThanOrEqualTo(20);
    }

    @Test
    void saveProfile_persistsAndCalculatesCompleteness() {
        when(profiles.findByUserId(USER_ID)).thenReturn(Optional.empty());
        when(profiles.save(any())).thenAnswer((Answer<CandidateProfile>) i -> i.getArgument(0));

        SaveCandidateProfileRequest req = new SaveCandidateProfileRequest(
                "Senior Java Engineer",
                3.5,
                "TCS",
                "Systems Engineer",
                "9 LPA",
                "18 LPA",
                30,
                "Bengaluru, Remote",
                "https://drive.google.com/resume.pdf",
                "Extensive experience in high-volume microservices",
                "Java, Spring Boot, Microservices, DSA, System Design, SQL",
                "AWS Solutions Architect",
                "B.Tech Computer Science");

        CandidateProfileDto saved = hireService.saveProfile(USER_ID, req);

        assertThat(saved.headline()).isEqualTo("Senior Java Engineer");
        assertThat(saved.yearsOfExperience()).isEqualTo(3.5);
        assertThat(saved.skills()).contains("Java", "Spring Boot");
        assertThat(saved.completenessPercent()).isGreaterThanOrEqualTo(80);
    }

    @Test
    void listJobs_calculatesRealtimeMatchScoresAndMatchingSkills() {
        CandidateProfile profile = new CandidateProfile(user);
        profile.setSkills("Java, Spring Boot, Microservices, DSA, System Design");
        profile.setYearsOfExperience(3.0);
        when(profiles.findByUserId(USER_ID)).thenReturn(Optional.of(profile));
        when(applications.findAllByUserId(USER_ID)).thenReturn(List.of());

        List<JobOpeningDto> list = hireService.listJobs(USER_ID);

        assertThat(list).hasSize(3);
        // Amazon job has 100% skill match + right YOE + DSA bonus -> high score
        JobOpeningDto amazonDto = list.stream().filter(j -> j.company().equals("Amazon")).findFirst().orElseThrow();
        assertThat(amazonDto.matchScore()).isGreaterThanOrEqualTo(85);
        assertThat(amazonDto.matchingSkills()).contains("Java", "Spring Boot", "Microservices", "System Design", "DSA");

        // Frontend job has zero matching skills -> lower score
        JobOpeningDto frontendDto = list.stream().filter(j -> j.company().equals("DesignLab")).findFirst().orElseThrow();
        assertThat(frontendDto.matchScore()).isLessThan(amazonDto.matchScore());
    }

    @Test
    void applyAllMatching_appliesOnlyToRolesAboveThreshold() {
        CandidateProfile profile = new CandidateProfile(user);
        profile.setSkills("Java, Spring Boot, Microservices, DSA, System Design, Kafka, Redis, PostgreSQL");
        profile.setYearsOfExperience(3.0);
        when(profiles.findByUserId(USER_ID)).thenReturn(Optional.of(profile));
        when(applications.findAllByUserId(USER_ID)).thenReturn(new ArrayList<>());

        ApplyAllResult result = hireService.applyAllMatching(USER_ID, 70);

        // Amazon and Swiggy should qualify (> 70%), DesignLab should not
        assertThat(result.appliedCount()).isGreaterThanOrEqualTo(2);
        assertThat(result.minScoreThreshold()).isEqualTo(70);
        assertThat(result.appliedApplications()).isNotEmpty();
    }

    private static void setField(Object target, String fieldName, Object value) throws Exception {
        Field f = target.getClass().getDeclaredField(fieldName);
        f.setAccessible(true);
        f.set(target, value);
    }
}
