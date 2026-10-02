package com.peerdsa.interview;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ai_interviews")
public class AiInterview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String track;

    @Column(name = "target_role", nullable = false)
    private String targetRole;

    @Column(nullable = false)
    private String level;

    @Column(nullable = false)
    private String status = "IN_PROGRESS";

    @Column(name = "overall_score", nullable = false)
    private int overallScore;

    @Column(name = "technical_depth", nullable = false)
    private int technicalDepth;

    @Column(name = "problem_solving", nullable = false)
    private int problemSolving;

    @Column(name = "communication", nullable = false)
    private int communication;

    @Column(name = "feedback_summary", nullable = false)
    private String feedbackSummary = "";

    @Column(nullable = false)
    private String strengths = "";

    @Column(nullable = false)
    private String weaknesses = "";

    @Column(name = "recommended_topics", nullable = false)
    private String recommendedTopics = "";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;

    public AiInterview() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getTrack() { return track; }
    public void setTrack(String track) { this.track = track; }

    public String getTargetRole() { return targetRole; }
    public void setTargetRole(String targetRole) { this.targetRole = targetRole; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getOverallScore() { return overallScore; }
    public void setOverallScore(int overallScore) { this.overallScore = overallScore; }

    public int getTechnicalDepth() { return technicalDepth; }
    public void setTechnicalDepth(int technicalDepth) { this.technicalDepth = technicalDepth; }

    public int getProblemSolving() { return problemSolving; }
    public void setProblemSolving(int problemSolving) { this.problemSolving = problemSolving; }

    public int getCommunication() { return communication; }
    public void setCommunication(int communication) { this.communication = communication; }

    public String getFeedbackSummary() { return feedbackSummary; }
    public void setFeedbackSummary(String feedbackSummary) { this.feedbackSummary = feedbackSummary; }

    public String getStrengths() { return strengths; }
    public void setStrengths(String strengths) { this.strengths = strengths; }

    public String getWeaknesses() { return weaknesses; }
    public void setWeaknesses(String weaknesses) { this.weaknesses = weaknesses; }

    public String getRecommendedTopics() { return recommendedTopics; }
    public void setRecommendedTopics(String recommendedTopics) { this.recommendedTopics = recommendedTopics; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }
}
