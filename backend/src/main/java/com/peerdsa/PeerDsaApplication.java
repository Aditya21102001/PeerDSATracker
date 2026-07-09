package com.peerdsa;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Boots the PeerDSATracker backend -- the only service permitted to write the Postgres
 * database. {@code @EnableScheduling} powers the background jobs and
 * {@code @ConfigurationPropertiesScan} binds the {@code app.*} records such as
 * {@link com.peerdsa.config.JwtProperties}.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class PeerDsaApplication {

    public static void main(String[] args) {
        SpringApplication.run(PeerDsaApplication.class, args);
    }
}
