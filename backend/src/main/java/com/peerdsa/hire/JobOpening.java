package com.peerdsa.hire;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "job_openings")
public class JobOpening {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String company;

    @Column(name = "company_logo_url", nullable = false)
    private String companyLogoUrl = "";

    @Column(nullable = false)
    private String location;

    @Column(name = "experience_min", nullable = false)
    private int experienceMin = 0;

    @Column(name = "experience_max", nullable = false)
    private int experienceMax = 10;

    @Column(name = "salary_range", nullable = false)
    private String salaryRange = "Competitive";

    @Column(name = "job_type", nullable = false)
    private String jobType = "FULL_TIME";

    @Column(name = "workplace_type", nullable = false)
    private String workplaceType = "HYBRID";

    @Column(name = "required_skills", nullable = false, columnDefinition = "text")
    private String requiredSkills;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "external_apply_url", nullable = false)
    private String externalApplyUrl = "";

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @Column(name = "openings_count", nullable = false)
    private int openingsCount = 1;

    @Column(name = "posted_at", nullable = false)
    private Instant postedAt = Instant.now();

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public JobOpening() {}

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCompany() {
        return company;
    }

    public void setCompany(String company) {
        this.company = company;
    }

    public String getCompanyLogoUrl() {
        return companyLogoUrl;
    }

    public void setCompanyLogoUrl(String companyLogoUrl) {
        this.companyLogoUrl = companyLogoUrl != null ? companyLogoUrl : "";
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public int getExperienceMin() {
        return experienceMin;
    }

    public void setExperienceMin(int experienceMin) {
        this.experienceMin = experienceMin;
    }

    public int getExperienceMax() {
        return experienceMax;
    }

    public void setExperienceMax(int experienceMax) {
        this.experienceMax = experienceMax;
    }

    public String getSalaryRange() {
        return salaryRange;
    }

    public void setSalaryRange(String salaryRange) {
        this.salaryRange = salaryRange != null ? salaryRange : "Competitive";
    }

    public String getJobType() {
        return jobType;
    }

    public void setJobType(String jobType) {
        this.jobType = jobType != null ? jobType : "FULL_TIME";
    }

    public String getWorkplaceType() {
        return workplaceType;
    }

    public void setWorkplaceType(String workplaceType) {
        this.workplaceType = workplaceType != null ? workplaceType : "HYBRID";
    }

    public String getRequiredSkills() {
        return requiredSkills;
    }

    public void setRequiredSkills(String requiredSkills) {
        this.requiredSkills = requiredSkills != null ? requiredSkills : "";
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description != null ? description : "";
    }

    public String getExternalApplyUrl() {
        return externalApplyUrl;
    }

    public void setExternalApplyUrl(String externalApplyUrl) {
        this.externalApplyUrl = externalApplyUrl != null ? externalApplyUrl : "";
    }

    public boolean isActive() {
        return isActive;
    }

    public void setActive(boolean active) {
        isActive = active;
    }

    public int getOpeningsCount() {
        return openingsCount;
    }

    public void setOpeningsCount(int openingsCount) {
        this.openingsCount = openingsCount;
    }

    public Instant getPostedAt() {
        return postedAt;
    }

    public void setPostedAt(Instant postedAt) {
        this.postedAt = postedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
