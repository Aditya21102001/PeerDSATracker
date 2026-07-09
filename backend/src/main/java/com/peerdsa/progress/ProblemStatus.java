package com.peerdsa.progress;

/** Absence of a row means unsolved. A row with a null status means starred-only. */
public enum ProblemStatus {
    SOLVED,
    ATTEMPTED,
    REVISIT
}
