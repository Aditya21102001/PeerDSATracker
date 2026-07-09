package com.peerdsa.sheet;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "sheet_sub_steps")
public class SheetSubStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "step_id", nullable = false)
    private SheetStep step;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private int position;

    public Long getId() {
        return id;
    }

    public SheetStep getStep() {
        return step;
    }

    public String getTitle() {
        return title;
    }

    public int getPosition() {
        return position;
    }
}
