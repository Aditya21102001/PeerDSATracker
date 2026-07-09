package com.peerdsa.sheet;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "sheet_steps")
public class SheetStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "step_no", nullable = false)
    private int stepNo;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private int position;

    public Long getId() {
        return id;
    }

    public int getStepNo() {
        return stepNo;
    }

    public String getTitle() {
        return title;
    }

    public int getPosition() {
        return position;
    }
}
