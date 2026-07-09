package com.peerdsa.gamification;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Spring Data access to the badges a user has earned. */
public interface UserBadgeRepository extends JpaRepository<UserBadge, UserBadge.Key> {

    List<UserBadge> findByUserId(Long userId);
}
