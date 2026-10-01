-- Shared study articles. Drafts are private to their author; published posts are visible to
-- every authenticated user through the application API.
CREATE TABLE blog_posts (
    id              bigserial   PRIMARY KEY,
    user_id         bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title           text        NOT NULL,
    subject         text        NOT NULL,
    excerpt         text        NOT NULL DEFAULT '',
    content         text        NOT NULL,
    tags            text        NOT NULL DEFAULT '',
    status          text        NOT NULL DEFAULT 'PUBLISHED'
        CHECK (status IN ('DRAFT', 'PUBLISHED')),
    published_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_posts_published ON blog_posts (status, published_at DESC);
CREATE INDEX idx_blog_posts_author ON blog_posts (user_id, updated_at DESC);
