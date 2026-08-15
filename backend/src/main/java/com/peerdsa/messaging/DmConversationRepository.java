package com.peerdsa.messaging;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Persistence for direct-message conversations. */
public interface DmConversationRepository extends JpaRepository<DmConversation, Long> {

    /** The pair is stored canonically, so the caller must pass (min, max). */
    Optional<DmConversation> findByUserLoIdAndUserHiId(Long lo, Long hi);

    /**
     * Every conversation this user is in, most recently active first. A participant can be on either
     * side of the pair, hence the OR -- and both branches are indexed.
     */
    @Query("""
            select c from DmConversation c
            where c.userLoId = :userId or c.userHiId = :userId
            order by c.lastMessageAt desc nulls last, c.id desc
            """)
    List<DmConversation> findForUser(@Param("userId") Long userId);
}
