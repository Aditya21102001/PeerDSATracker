package com.peerdsa.gamification;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserBadgeRepository extends JpaRepository<UserBadge, UserBadge.Key> {

    List<UserBadge> findByUserId(Long userId);
}
