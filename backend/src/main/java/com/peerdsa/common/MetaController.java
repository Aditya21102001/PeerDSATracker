package com.peerdsa.common;

import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.info.BuildProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * What is deployed, and how long it has been awake. Public, cheap, and touches nothing.
 *
 * <p>Two callers, both in the browser. The footer stamps the running version so a bug report can
 * name the build it came from; the frontend's cold-start probe polls this to find out whether the
 * backend is answering at all yet.
 *
 * <p><b>Why not {@code /actuator/health}.</b> That path is Render's {@code healthCheckPath}, and
 * Render allows a health check only 5 seconds -- which is exactly why {@code
 * MANAGEMENT_HEALTH_DB_ENABLED=false} is set in render.yaml. It has to stay a fast, dumb liveness
 * ping owned by the platform. This endpoint is owned by the frontend, lives under {@code /api/**}
 * so the CORS registration in {@link com.peerdsa.config.SecurityConfig} already covers it, and is
 * reachable through Vercel's {@code /api/*} rewrite like every other call the SPA makes.
 *
 * <p><b>Why it makes no database call.</b> Tempting, since Neon's compute suspends when idle and
 * "is the database awake" is a fair question. But Flyway runs against it during startup, so an
 * instance that is answering HTTP at all has already woken Neon seconds earlier -- and a probe
 * here would block on Hikari's 30-second connection timeout, turning the one endpoint whose job is
 * to answer instantly into the slowest in the application.
 */
@RestController
@RequestMapping("/api/meta")
public class MetaController {

    /**
     * Set at construction, which is startup. On Render's free plan this is NOT the deploy time:
     * the instance is spun down after 15 minutes of inactivity and started again on the next
     * request, so this moves without anything being deployed. {@code builtAt} is the stable
     * identity of a release; this is only how long the current process has been up.
     */
    private final Instant startedAt = Instant.now();

    /**
     * Absent unless {@code spring-boot-maven-plugin}'s {@code build-info} goal has run, which
     * writes {@code META-INF/build-info.properties}. It is wired in pom.xml, but an IDE that
     * compiles straight to {@code target/classes} can skip it -- hence optional rather than a
     * hard dependency that would fail startup over a version string.
     */
    private final BuildProperties build;

    /** Blank off Render, where nothing sets it. See {@code app.build.commit}. */
    private final String commit;

    public MetaController(
            ObjectProvider<BuildProperties> build, @Value("${app.build.commit:}") String commit) {
        this.build = build.getIfAvailable();
        this.commit = commit;
    }

    @GetMapping
    public Meta meta() {
        return new Meta(
                build != null ? build.getVersion() : "dev",
                commit,
                build != null ? build.getTime() : null,
                startedAt,
                Duration.between(startedAt, Instant.now()).toSeconds());
    }

    /**
     * @param version Maven project version, or {@code "dev"} when build info was not generated.
     * @param commit git sha of the deployed build; blank if unknown.
     * @param builtAt when the jar was packaged -- the release timestamp. Null without build info.
     * @param startedAt when this process came up, which on the free plan is when it last woke.
     * @param uptimeSeconds a handful of seconds here means the caller just paid for a cold start.
     */
    public record Meta(
            String version, String commit, Instant builtAt, Instant startedAt, long uptimeSeconds) {}
}
