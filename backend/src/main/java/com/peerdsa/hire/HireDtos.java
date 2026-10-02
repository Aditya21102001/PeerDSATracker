package com.peerdsa.hire;

import java.time.Instant;
import java.util.List;

public final class HireDtos {

    public record CandidateProfileDto(
            String headline,
            double yearsOfExperience,
            String currentCompany,
            String currentRole,
            String currentCtc,
            String expectedCtc,
            int noticePeriodDays,
            String preferredLocations,
            String resumeUrl,
            String resumeSummary,
            String skills,
            String certifications,
            String education,
            Instant updatedAt,
            int completenessPercent) {}

    public record SaveCandidateProfileRequest(
            String headline,
            Double yearsOfExperience,
            String currentCompany,
            String currentRole,
            String currentCtc,
            String expectedCtc,
            Integer noticePeriodDays,
            String preferredLocations,
            String resumeUrl,
            String resumeSummary,
            String skills,
            String certifications,
            String education) {}

    public record JobOpeningDto(
            Long id,
            String title,
            String company,
            String companyLogoUrl,
            String location,
            int experienceMin,
            int experienceMax,
            String salaryRange,
            String jobType,
            String workplaceType,
            String requiredSkills,
            String description,
            String externalApplyUrl,
            Instant postedAt,
            int matchScore,
            List<String> matchingSkills,
            List<String> missingSkills,
            boolean isApplied,
            String applicationStatus,
            Instant appliedAt) {}

    public record JobApplicationDto(
            Long id,
            Long jobId,
            String jobTitle,
            String company,
            String companyLogoUrl,
            String location,
            String salaryRange,
            String status,
            int matchScore,
            Instant appliedAt,
            String notes) {}

    public record ApplyAllRequest(Integer minMatchScore) {}

    public record ApplyAllResult(
            int appliedCount,
            int totalMatchingCount,
            int minScoreThreshold,
            String message,
            List<JobApplicationDto> appliedApplications) {}

    public record ExtractResumeRequest(String resumeText) {}

    public record ExtractedProfileDto(
            String headline,
            double yearsOfExperience,
            String currentCompany,
            String currentRole,
            String currentCtc,
            String expectedCtc,
            int noticePeriodDays,
            String preferredLocations,
            String skills,
            String certifications,
            String education,
            String resumeSummary) {}

    private HireDtos() {}
}
