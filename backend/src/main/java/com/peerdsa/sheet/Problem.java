package com.peerdsa.sheet;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.HashSet;
import java.util.Set;

/**
 * A single A2Z-sheet problem (474 in the seed) and the leaf of the content hierarchy
 * {@link SheetStep} -> {@link SheetSubStep} -> {@link Problem}. Also tagged with the
 * {@link Topic}s that the analytics weakness report groups by.
 */
@Entity
@Table(name = "problems")
public class Problem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sub_step_id", nullable = false)
    private SheetSubStep subStep;

    @Column(nullable = false)
    private String title;

    // Stored as text with a CHECK constraint, not a native Postgres enum.
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Difficulty difficulty;

    @Column(nullable = false)
    private int position;

    @Column(name = "leetcode_url")
    private String leetcodeUrl;

    @Column(name = "gfg_url")
    private String gfgUrl;

    @Column(name = "youtube_url")
    private String youtubeUrl;

    @Column(name = "article_url")
    private String articleUrl;

    @Column(name = "external_slug")
    private String externalSlug;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "problem_topics",
            joinColumns = @JoinColumn(name = "problem_id"),
            inverseJoinColumns = @JoinColumn(name = "topic_id"))
    private Set<Topic> topics = new HashSet<>();

    public Long getId() {
        return id;
    }

    public SheetSubStep getSubStep() {
        return subStep;
    }

    public String getTitle() {
        return title;
    }

    public Difficulty getDifficulty() {
        return difficulty;
    }

    public int getPosition() {
        return position;
    }

    public String getLeetcodeUrl() {
        return leetcodeUrl;
    }

    public String getGfgUrl() {
        return gfgUrl;
    }

    public String getYoutubeUrl() {
        return youtubeUrl;
    }

    public String getArticleUrl() {
        return articleUrl;
    }

    public String getExternalSlug() {
        return externalSlug;
    }

    public Set<Topic> getTopics() {
        return topics;
    }

    /** Problems carry exactly one topic in the A2Z seed; analytics needs a single label. */
    public String primaryTopicName() {
        return topics.stream().map(Topic::getName).findFirst().orElse(null);
    }
}
