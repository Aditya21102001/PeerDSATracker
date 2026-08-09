package com.peerdsa.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.mail")
public record DigestMailProperties(
        boolean enabled,
        String from,
        String host,
        Integer port,
        String username,
        String password,
        String protocol,
        boolean startTlsEnable,
        boolean auth,
        String cron,
        String zone) {}
