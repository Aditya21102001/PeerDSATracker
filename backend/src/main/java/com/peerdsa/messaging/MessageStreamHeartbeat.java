package com.peerdsa.messaging;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Sends a comment down every open message stream every 25 seconds.
 *
 * <p>Two things need it. Proxies and load balancers close a connection that has been silent for
 * long enough, and Render's edge is no exception -- a chat that is quiet for a minute would
 * otherwise die and only recover on the client's next reconnect. And a client cannot distinguish a
 * quiet stream from a dead one; a regular keep-alive is what makes "no traffic" mean "no messages"
 * rather than "no connection".
 *
 * <p>25 seconds because the usual idle timeout in front of an application is 30 or 60.
 */
@Component
public class MessageStreamHeartbeat {

    private final MessageStream stream;

    public MessageStreamHeartbeat(MessageStream stream) {
        this.stream = stream;
    }

    @Scheduled(fixedDelay = 25_000)
    public void keepAlive() {
        stream.heartbeat();
    }
}
