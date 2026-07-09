package com.peerdsa.streak;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyActivityRepository extends JpaRepository<DailyActivity, Long> {

    Optional<DailyActivity> findByUserIdAndActivityDate(Long userId, LocalDate activityDate);

    List<DailyActivity> findByUserIdAndActivityDateBetweenOrderByActivityDate(
            Long userId, LocalDate from, LocalDate to);

    long countByUserId(Long userId);
}
