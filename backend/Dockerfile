# Render has no native Java runtime, so the backend ships as a container.
# Target: Render's free instance -- 512 MB RAM, 0.1 CPU.

# ---------------------------------------------------------------- build
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build

# Resolve dependencies against the pom alone, so this layer stays cached
# whenever only src/ changes. Rebuilds then skip the whole download.
COPY pom.xml .
RUN mvn -B -ntp dependency:go-offline

COPY src ./src
RUN mvn -B -ntp -DskipTests clean package

# -------------------------------------------------------------- runtime
FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app app
COPY --from=build /build/target/*.jar /app/app.jar
USER app

# -XX:+UseContainerSupport is on by default in Java 17, so the JVM already reads
# the 512 MB cgroup limit.
#
# MaxRAMPercentage over -Xmx: it is container-aware, and setting -Xmx would win
# and silently disable the percentage. 50% (~256 MB heap) is deliberately
# conservative -- Spring Boot + Hibernate + Tomcat carry a heavy NON-heap
# footprint (metaspace, thread stacks, code cache, JDBC/TLS buffers). If the
# container gets OOM-killed (exit 137), drop this to 40 before anything else.
#
# UseSerialGC: one GC thread and less native memory than G1 on 0.1 CPU.
# TieredStopAtLevel=1: skips the C2 optimizing JIT, which is the dominant
# startup cost on a starved CPU. Costs peak throughput we do not need.
# ExitOnOutOfMemoryError: die cleanly so Render restarts, rather than limp.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=50.0 \
-XX:MaxMetaspaceSize=128m \
-XX:+UseSerialGC \
-XX:TieredStopAtLevel=1 \
-XX:+ExitOnOutOfMemoryError \
-Djava.security.egd=file:/dev/./urandom"

EXPOSE 8080

# Render injects PORT (default 10000). Spring only maps SERVER_PORT -> server.port,
# never PORT, so it is passed as a command-line argument instead. Tomcat already
# binds 0.0.0.0, which Render requires.
#
# Shell form expands the variables; exec makes java PID 1 so it receives SIGTERM
# and shuts down gracefully.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar --server.port=${PORT:-8080}"]
