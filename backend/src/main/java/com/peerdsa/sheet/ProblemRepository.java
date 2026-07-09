package com.peerdsa.sheet;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.lang.NonNull;

public interface ProblemRepository extends JpaRepository<Problem, Long>, JpaSpecificationExecutor<Problem> {

    /**
     * Specifications rather than a JPQL "(:difficulty is null or ...)" filter: the
     * null-parameter comparison is where Hibernate's enum binding gets fussy, and
     * the entity graph keeps this from N+1'ing on subStep/step for every row.
     */
    @Override
    @NonNull
    @EntityGraph(attributePaths = {"subStep", "subStep.step"})
    Page<Problem> findAll(Specification<Problem> spec, @NonNull Pageable pageable);

    /**
     * findById alone returns a Problem whose subStep is a lazy proxy. With
     * spring.jpa.open-in-view=false there is no session left by the time the DTO is
     * built, so the graph has to be fetched up front.
     */
    @EntityGraph(attributePaths = {"subStep", "subStep.step"})
    Optional<Problem> findWithStepById(Long id);

    interface StepTotal {
        int getStepNo();

        String getStepTitle();

        long getTotal();
    }

    @Query("""
            select st.stepNo as stepNo, st.title as stepTitle, count(p) as total
            from Problem p
            join p.subStep ss
            join ss.step st
            group by st.stepNo, st.title
            order by st.stepNo
            """)
    List<StepTotal> countPerStep();

    interface TopicTotal {
        String getTopic();

        long getTotal();
    }

    @Query("""
            select t.name as topic, count(p) as total
            from Problem p
            join p.topics t
            group by t.name
            order by t.name
            """)
    List<TopicTotal> countPerTopic();
}
