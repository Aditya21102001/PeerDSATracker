package com.peerdsa.gamification;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * Join row recording that a user holds a badge; the mere existence of the row is the award.
 * {@code awardedAt} is populated by the database default, hence {@code insertable = false}.
 */
@Entity
@Table(name = "user_badges")
@IdClass(UserBadge.Key.class)
public class UserBadge {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Id
    @Column(name = "badge_id")
    private Long badgeId;

    @Column(name = "awarded_at", nullable = false, updatable = false, insertable = false)
    private Instant awardedAt;

    protected UserBadge() {}

    public UserBadge(Long userId, Long badgeId) {
        this.userId = userId;
        this.badgeId = badgeId;
    }

    public Long getBadgeId() {
        return badgeId;
    }

    public Instant getAwardedAt() {
        return awardedAt;
    }

    /** Composite primary key (user_id, badge_id). */
    public static class Key implements Serializable {
        private Long userId;
        private Long badgeId;

        public Key() {}

        public Key(Long userId, Long badgeId) {
            this.userId = userId;
            this.badgeId = badgeId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;
            }
            if (!(o instanceof Key key)) {
                return false;
            }
            return Objects.equals(userId, key.userId) && Objects.equals(badgeId, key.badgeId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, badgeId);
        }
    }
}
