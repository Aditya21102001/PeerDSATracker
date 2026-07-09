package com.peerdsa.peers;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for the {@link Follow} directed edge, keyed by the composite {@link Follow.Key}. */
public interface FollowRepository extends JpaRepository<Follow, Follow.Key> {

    List<Follow> findByFollowerId(Long followerId);

    List<Follow> findByFolloweeId(Long followeeId);

    boolean existsByFollowerIdAndFolloweeId(Long followerId, Long followeeId);

    void deleteByFollowerIdAndFolloweeId(Long followerId, Long followeeId);
}
