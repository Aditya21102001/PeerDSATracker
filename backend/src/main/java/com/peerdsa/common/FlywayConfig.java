package com.peerdsa.common;

import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FlywayConfig {

    private static final Logger log = LoggerFactory.getLogger(FlywayConfig.class);

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            try {
                log.info("Running Flyway repair to synchronize migration checksums...");
                flyway.repair();
            } catch (Exception e) {
                log.warn("Flyway repair encountered an issue (ignoring): {}", e.getMessage());
            }
            log.info("Running Flyway migrate...");
            flyway.migrate();
        };
    }
}
