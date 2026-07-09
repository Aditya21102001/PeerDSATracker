package com.peerdsa.notes;

import com.peerdsa.sheet.Problem;
import com.peerdsa.sheet.ProblemRepository;
import java.time.Instant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotesService {

    private final NoteRepository notes;
    private final ProblemRepository problems;

    public NotesService(NoteRepository notes, ProblemRepository problems) {
        this.notes = notes;
        this.problems = problems;
    }

    /** An absent note reads as empty rather than 404: the editor always has something to open. */
    @Transactional(readOnly = true)
    public NoteView get(Long userId, Long problemId) {
        return notes.findByUserIdAndProblemId(userId, problemId)
                .map(NoteView::from)
                .orElseGet(() -> new NoteView(problemId, "", null));
    }

    @Transactional
    public NoteView save(Long userId, Long problemId, String content) {
        Note note = notes.findByUserIdAndProblemId(userId, problemId).orElseGet(() -> {
            Problem problem = problems.findById(problemId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown problem"));
            return new Note(userId, problem);
        });

        note.setContent(content);
        return NoteView.from(notes.save(note));
    }

    @Transactional
    public void delete(Long userId, Long problemId) {
        notes.findByUserIdAndProblemId(userId, problemId).ifPresent(notes::delete);
    }

    @Transactional(readOnly = true)
    public Page<NoteSummary> list(Long userId, Pageable pageable) {
        return notes.findByUserIdOrderByUpdatedAtDesc(userId, pageable).map(NoteSummary::from);
    }

    public record NoteView(Long problemId, String content, Instant updatedAt) {
        static NoteView from(Note note) {
            return new NoteView(note.getProblem().getId(), note.getContent(), note.getUpdatedAt());
        }
    }

    public record NoteSummary(
            Long problemId, String problemTitle, int stepNo, String content, Instant updatedAt) {
        static NoteSummary from(Note note) {
            Problem p = note.getProblem();
            return new NoteSummary(
                    p.getId(),
                    p.getTitle(),
                    p.getSubStep().getStep().getStepNo(),
                    note.getContent(),
                    note.getUpdatedAt());
        }
    }
}
