package com.peerdsa.notes;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for {@link Note}; the unique (user, problem) pair caps lookups at one row. */
public interface NoteRepository extends JpaRepository<Note, Long> {

    Optional<Note> findByUserIdAndProblemId(Long userId, Long problemId);

    /** The list view shows each note's problem title, so fetch the graph up front. */
    @EntityGraph(attributePaths = {"problem", "problem.subStep", "problem.subStep.step"})
    Page<Note> findByUserIdOrderByUpdatedAtDesc(Long userId, Pageable pageable);
}
