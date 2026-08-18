package com.peerdsa.common;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * Translates exceptions thrown by controllers into the uniform {@link ApiError} JSON envelope,
 * keeping client mistakes (malformed body, failed validation) as 4xx rather than leaking 500s.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Uniform JSON error envelope; {@code fieldErrors} is empty except for validation failures. */
    public record ApiError(Instant timestamp, int status, String message, Map<String, String> fieldErrors) {}

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> handleStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode())
                .body(new ApiError(Instant.now(), ex.getStatusCode().value(), ex.getReason(), Map.of()));
    }

    /** Unparseable body or an unknown enum value: a client error, not a server error. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest()
                .body(new ApiError(Instant.now(), HttpStatus.BAD_REQUEST.value(), "Malformed request body", Map.of()));
    }

    /** Flattens bean-validation failures into a field-to-message map; the first message per field wins. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(e -> fields.putIfAbsent(e.getField(), e.getDefaultMessage()));

        return ResponseEntity.badRequest()
                .body(new ApiError(Instant.now(), HttpStatus.BAD_REQUEST.value(), "Validation failed", fields));
    }

    /**
     * Anything that reached the client as a 500.
     *
     * <p>Added after a production incident in which {@code POST /api/messages/conversations}
     * answered 500 repeatedly and there was <b>nothing to debug it with</b>. Without a handler here,
     * an unhandled exception skips this advice entirely and falls through to Spring Boot's
     * {@code BasicErrorController}, which has two consequences that are easy to miss:
     *
     * <ul>
     *   <li>The response stops being the {@link ApiError} envelope every other error in this
     *       application uses. It becomes {@code {timestamp, status, error, path}} -- and since
     *       {@code server.error.include-message} defaults to {@code never}, it carries no reason at
     *       all. A client cannot tell why, and neither can the developer reading a screenshot of it.
     *   <li>Nothing in this application logs it. Whatever threw is discarded, so the one artefact
     *       that would identify the bug never exists.
     * </ul>
     *
     * <p>So this logs the stack trace with the method and path that produced it, and returns the
     * uniform envelope. The message is deliberately generic: the exception's own text can name a
     * table, a column, or a constraint, and that belongs in the log, not in a response to whoever
     * asked. ERROR is the right level -- every occurrence is a bug in this application.
     *
     * <p>Declared last and matching only {@link Exception}, so Spring's most-specific-handler
     * resolution keeps every 4xx above it exactly as it was.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled {} {} -> 500", request.getMethod(), request.getRequestURI(), ex);

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError(
                        Instant.now(),
                        HttpStatus.INTERNAL_SERVER_ERROR.value(),
                        "Something went wrong on our end.",
                        Map.of()));
    }
}
