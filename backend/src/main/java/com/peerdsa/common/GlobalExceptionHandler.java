package com.peerdsa.common;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
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
}
