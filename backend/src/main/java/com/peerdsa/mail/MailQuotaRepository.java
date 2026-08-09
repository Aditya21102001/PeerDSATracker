package com.peerdsa.mail;

import java.time.LocalDate;
import org.springframework.data.jpa.repository.JpaRepository;

/** Persistence for the daily send counter. Keyed by calendar day, so it needs no cleanup job. */
public interface MailQuotaRepository extends JpaRepository<MailQuota, LocalDate> {}
