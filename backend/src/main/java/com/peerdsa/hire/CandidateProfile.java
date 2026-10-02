package com.peerdsa.hire;

import com.peerdsa.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "candidate_profiles")
public class CandidateProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(nullable = false)
    private String headline = "";

    @Column(name = "years_of_experience", nullable = false)
    private double yearsOfExperience = 0.0;

    @Column(name = "current_company", nullable = false)
    private String currentCompany = "";

    @Column(name = "current_role", nullable = false)
    private String currentRole = "";

    @Column(name = "current_ctc", nullable = false)
    private String currentCtc = "";

    @Column(name = "expected_ctc", nullable = false)
    private String expectedCtc = "";

    @Column(name = "notice_period_days", nullable = false)
    private int noticePeriodDays = 30;

    @Column(name = "preferred_locations", nullable = false)
    private String preferredLocations = "";

    @Column(name = "resume_url", nullable = false)
    private String resumeUrl = "";

    @Column(name = "resume_summary", nullable = false, columnDefinition = "text")
    private String resumeSummary = "";

    @Column(nullable = false, columnDefinition = "text")
    private String skills = "";

    @Column(nullable = false, columnDefinition = "text")
    private String certifications = "";

    @Column(nullable = false, columnDefinition = "text")
    private String education = "";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public CandidateProfile() {}

    public CandidateProfile(User user) {
        this.user = user;
    }

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getHeadline() {
        return headline;
    }

    public void setHeadline(String headline) {
        this.headline = headline != null ? headline : "";
    }

    public double getYearsOfExperience() {
        return yearsOfExperience;
    }

    public void setYearsOfExperience(double yearsOfExperience) {
        this.yearsOfExperience = Math.max(0.0, yearsOfExperience);
    }

    public String getCurrentCompany() {
        return currentCompany;
    }

    public void setCurrentCompany(String currentCompany) {
        this.currentCompany = currentCompany != null ? currentCompany : "";
    }

    public String getCurrentRole() {
        return currentRole;
    }

    public void setCurrentRole(String currentRole) {
        this.currentRole = currentRole != null ? currentRole : "";
    }

    public String getCurrentCtc() {
        return currentCtc;
    }

    public void setCurrentCtc(String currentCtc) {
        this.currentCtc = currentCtc != null ? currentCtc : "";
    }

    public String getExpectedCtc() {
        return expectedCtc;
    }

    public void setExpectedCtc(String expectedCtc) {
        this.expectedCtc = expectedCtc != null ? expectedCtc : "";
    }

    public int getNoticePeriodDays() {
        return noticePeriodDays;
    }

    public void setNoticePeriodDays(int noticePeriodDays) {
        this.noticePeriodDays = Math.max(0, noticePeriodDays);
    }

    public String getPreferredLocations() {
        return preferredLocations;
    }

    public void setPreferredLocations(String preferredLocations) {
        this.preferredLocations = preferredLocations != null ? preferredLocations : "";
    }

    public String getResumeUrl() {
        return resumeUrl;
    }

    public void setResumeUrl(String resumeUrl) {
        this.resumeUrl = resumeUrl != null ? resumeUrl : "";
    }

    public String getResumeSummary() {
        return resumeSummary;
    }

    public void setResumeSummary(String resumeSummary) {
        this.resumeSummary = resumeSummary != null ? resumeSummary : "";
    }

    public String getSkills() {
        return skills;
    }

    public void setSkills(String skills) {
        this.skills = skills != null ? skills : "";
    }

    public String getCertifications() {
        return certifications;
    }

    public void setCertifications(String certifications) {
        this.certifications = certifications != null ? certifications : "";
    }

    public String getEducation() {
        return education;
    }

    public void setEducation(String education) {
        this.education = education != null ? education : "";
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
