package com.peerdsa.interview;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ai_interview_turns")
public class AiInterviewTurn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "interview_id", nullable = false)
    private Long interviewId;

    @Column(name = "turn_index", nullable = false)
    private int turnIndex;

    @Column(nullable = false)
    private String question;

    @Column(nullable = false)
    private String topic = "";

    @Column(name = "candidate_answer", nullable = false)
    private String candidateAnswer = "";

    @Column(name = "ai_evaluation", nullable = false)
    private String aiEvaluation = "";

    @Column(nullable = false)
    private int score;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public AiInterviewTurn() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getInterviewId() { return interviewId; }
    public void setInterviewId(Long interviewId) { this.interviewId = interviewId; }

    public int getTurnIndex() { return turnIndex; }
    public void setTurnIndex(int turnIndex) { this.turnIndex = turnIndex; }

    public String getQuestion() { return question; }
    public void setQuestion(String question) { this.question = question; }

    public String getTopic() { return topic; }
    public void setTopic(String topic) { this.topic = topic; }

    public String getCandidateAnswer() { return candidateAnswer; }
    public void setCandidateAnswer(String candidateAnswer) { this.candidateAnswer = candidateAnswer; }

    public String getAiEvaluation() { return aiEvaluation; }
    public void setAiEvaluation(String aiEvaluation) { this.aiEvaluation = aiEvaluation; }

    public int getScore() { return score; }
    public void setScore(int score) { this.score = score; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
