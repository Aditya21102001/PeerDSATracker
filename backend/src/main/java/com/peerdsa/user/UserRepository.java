package com.peerdsa.user;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, Long> {

    /**
     * IgnoreCase generates lower(email) = lower(?), which matches the
     * uq_users_email_lower functional index rather than forcing a sequential scan.
     */
    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    /** Excludes the caller, so you can never find yourself in the "follow" results. */
    @Query("""
            select u from User u
            where lower(u.username) like lower(concat('%', :q, '%'))
              and u.id <> :me
            order by u.username
            """)
    List<User> searchByUsername(@Param("q") String q, @Param("me") Long me, Pageable pageable);

    /**
     * Zeroes the streak of everyone who missed yesterday. Native because it needs
     * Postgres' CURRENT_DATE against a date column.
     */
    @Modifying(clearAutomatically = true)
    @Query(
            value = """
                    update users
                    set current_streak = 0
                    where current_streak > 0
                      and (last_active_date is null or last_active_date < CURRENT_DATE - 1)
                    """,
            nativeQuery = true)
    int resetStaleStreaks();
}
