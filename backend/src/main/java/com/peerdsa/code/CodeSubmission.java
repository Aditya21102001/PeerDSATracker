package com.peerdsa.code;

import com.peerdsa.sheet.Problem;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * A user's saved code for one problem in one language. The (user, problem, language) triple is
 * unique, so switching language opens a separate draft rather than overwriting the last one.
 *
 * <p>This holds only source the user chose to save; execution is stateless and never recorded.
 */
@Entity
@Table(
        name = "code_submissions",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "problem_id", "language"}))
public class CodeSubmission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "problem_id", nullable = false)
    private Problem problem;

    /** Piston language id (e.g. {@code python}, {@code c++}), not a display label. */
    @Column(nullable = false)
    private String language;

    @Column(nullable = false)
    private String source = "";

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected CodeSubmission() {}

    public CodeSubmission(Long userId, Problem problem, String language) {
        this.userId = userId;
        this.problem = problem;
        this.language = language;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public Problem getProblem() {
        return problem;
    }

    public String getLanguage() {
        return language;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source == null ? "" : source;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
