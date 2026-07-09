package com.peerdsa.streak;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Spring Data access to {@code daily_activity}, one row per user per active calendar day. */
public interface DailyActivityRepository extends JpaRepository<DailyActivity, Long> {

    Optional<DailyActivity> findByUserIdAndActivityDate(Long userId, LocalDate activityDate);

    List<DailyActivity> findByUserIdAndActivityDateBetweenOrderByActivityDate(
            Long userId, LocalDate from, LocalDate to);

    long countByUserId(Long userId);
}
