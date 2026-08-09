package com.peerdsa.mail;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;

/** One row per calendar day: how many emails have actually gone out. See {@code V11__mail_quota}. */
@Entity
@Table(name = "mail_quota")
public class MailQuota {

    @Id
    @Column(name = "day", nullable = false)
    private LocalDate day;

    @Column(name = "sent", nullable = false)
    private int sent;

    protected MailQuota() {}

    public MailQuota(LocalDate day, int sent) {
        this.day = day;
        this.sent = sent;
    }

    public LocalDate getDay() {
        return day;
    }

    public int getSent() {
        return sent;
    }
}
