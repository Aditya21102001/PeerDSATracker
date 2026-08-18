package com.peerdsa.messaging;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Persistence for direct-message conversations. */
public interface DmConversationRepository extends JpaRepository<DmConversation, Long> {

    /** The pair is stored canonically, so the caller must pass (min, max). */
    Optional<DmConversation> findByUserLoIdAndUserHiId(Long lo, Long hi);

    /**
     * Creates the pair unless it already exists, and never fails if it does.
     *
     * <p>"Look it up, and save one if absent" is not safe against {@code uq_dm_pair}: two people
     * opening the same thread at once both find nothing and both insert, and the loser's insert
     * violates the constraint. That surfaced as a 500. The obvious repair -- catch
     * {@code DataIntegrityViolationException} and look the row up again -- does not work inside a
     * transaction: a failed flush marks it rollback-only and leaves the persistence context
     * unusable, so the recovery read fails too.
     *
     * <p>{@code ON CONFLICT DO NOTHING} moves the decision into the database, where the constraint
     * already lives. Both racers end up looking at the same single row and nothing throws. Native
     * because this is PostgreSQL syntax with no JPQL equivalent, which is no constraint here --
     * Flyway and Neon already make this application PostgreSQL-only.
     *
     * <p>{@code created_at} is deliberately omitted: the column has a {@code DEFAULT now()} and the
     * entity marks it {@code insertable = false}, so the database owns it on both paths.
     */
    @Modifying
    @Query(
            value =
                    """
                    insert into dm_conversations (user_lo_id, user_hi_id)
                    values (:lo, :hi)
                    on conflict (user_lo_id, user_hi_id) do nothing
                    """,
            nativeQuery = true)
    void insertIfAbsent(@Param("lo") Long lo, @Param("hi") Long hi);

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
