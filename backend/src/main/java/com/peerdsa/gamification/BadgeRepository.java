package com.peerdsa.gamification;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BadgeRepository extends JpaRepository<Badge, Long> {

    /**
     * Seed order, which groups them solved -> streak -> XP. Ordering by criteria_type
     * would sort the stored text alphabetically and put STREAK first.
     */
    List<Badge> findAllByOrderByIdAsc();
}
