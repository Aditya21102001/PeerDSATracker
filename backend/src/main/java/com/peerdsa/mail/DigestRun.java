package com.peerdsa.mail;

/**
 * Which of the day's two sends this is.
 *
 * <p>They are deliberately not the same email. The morning digest goes to every subscriber and
 * frames the day ahead. The evening one is a nudge, and it goes <b>only to people who have not
 * practised yet today</b> -- telling somebody at 6pm that they have already done their practice is
 * noise, and an identical email twice a day is the fastest way to teach people to ignore both, or
 * to mark them as spam.
 *
 * <p>That filter is also what keeps two sends affordable: on any day where people actually use the
 * app, the evening run is much smaller than the morning one.
 */
public enum DigestRun {

    /** The full digest, to everyone who is subscribed. */
    MORNING("morning"),

    /** A shorter reminder, to those who have not practised today. */
    EVENING("evening");

    private final String label;

    DigestRun(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
