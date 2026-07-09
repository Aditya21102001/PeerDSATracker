package com.peerdsa.gamification;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Spring Data access to the seeded {@code badges} catalog. */
public interface BadgeRepository extends JpaRepository<Badge, Long> {

    /**
     * Seed order, which groups them solved -> streak -> XP. Ordering by criteria_type
     * would sort the stored text alphabetically and put STREAK first.
     */
    List<Badge> findAllByOrderByIdAsc();
}
