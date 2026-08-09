package com.peerdsa.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;

/**
 * The account aggregate and the leaderboard row. Beyond credentials it carries denormalized
 * counters ({@code xp}, {@code totalSolved}, streaks, {@code lastActiveDate}) maintained at
 * write time by ProgressService/StreakService, so a leaderboard read stays a single indexed
 * scan instead of aggregating every user's progress rows.
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Uniqueness is enforced by unique indexes on lower(email) / lower(username).
    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String username;

    /**
     * Null for an account created through an identity provider, which has never had a password.
     * Never hand this to a {@code PasswordEncoder} without a null check: {@code matches} throws on
     * a null hash rather than returning false, so the "wrong password" path would 500.
     */
    @Column(name = "password_hash")
    private String passwordHash;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(nullable = false)
    private String role = "USER";

    /**
     * False only for an account provisioned through an identity provider, which was given a
     * generated username its owner has never seen. The SPA asks them to confirm or change it on
     * first arrival; until they do, the name on the public leaderboard is one they never picked.
     */
    @Column(name = "username_chosen", nullable = false)
    private boolean usernameChosen = true;

    /**
     * Whether this account wants the morning practice digest. On by default -- being nudged is
     * what a study tracker is for -- and cleared either from the in-app toggle or the one-click
     * link in every digest footer. See {@link com.peerdsa.mail.UnsubscribeTokens} for why that
     * link deliberately needs no session.
     */
    @Column(name = "email_digest", nullable = false)
    private boolean emailDigest = true;

    // Denormalized counters, maintained at write time. See ProgressService.
    @Column(nullable = false)
    private int xp = 0;

    @Column(name = "total_solved", nullable = false)
    private int totalSolved = 0;

    @Column(name = "current_streak", nullable = false)
    private int currentStreak = 0;

    @Column(name = "longest_streak", nullable = false)
    private int longestStreak = 0;

    @Column(name = "last_active_date")
    private LocalDate lastActiveDate;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public String getRole() {
        return role;
    }

    /**
     * Deliberately the only way to change a role, and deliberately not called from any sign-in
     * path. An identity provider proves who someone is; it does not get to decide what they may
     * do -- signing in through Google must leave an existing account's role exactly as it was.
     */
    public void setRole(String role) {
        this.role = role;
    }

    public boolean isUsernameChosen() {
        return usernameChosen;
    }

    public void setUsernameChosen(boolean usernameChosen) {
        this.usernameChosen = usernameChosen;
    }

    public boolean isEmailDigest() {
        return emailDigest;
    }

    public void setEmailDigest(boolean emailDigest) {
        this.emailDigest = emailDigest;
    }

    /** False for an account that has only ever signed in through an identity provider. */
    public boolean hasPassword() {
        return passwordHash != null && !passwordHash.isBlank();
    }

    public int getXp() {
        return xp;
    }

    public int getTotalSolved() {
        return totalSolved;
    }

    public int getCurrentStreak() {
        return currentStreak;
    }

    public int getLongestStreak() {
        return longestStreak;
    }

    public LocalDate getLastActiveDate() {
        return lastActiveDate;
    }

    // Counters are maintained at write time by ProgressService/StreakService.
    // They clamp at zero so an un-solve can never drive them negative.

    public void addXp(int delta) {
        this.xp = Math.max(0, this.xp + delta);
    }

    public void addSolved(int delta) {
        this.totalSolved = Math.max(0, this.totalSolved + delta);
    }

    public void setCurrentStreak(int currentStreak) {
        this.currentStreak = Math.max(0, currentStreak);
    }

    public void setLongestStreak(int longestStreak) {
        this.longestStreak = Math.max(0, longestStreak);
    }

    public void setLastActiveDate(LocalDate lastActiveDate) {
        this.lastActiveDate = lastActiveDate;
    }
}
