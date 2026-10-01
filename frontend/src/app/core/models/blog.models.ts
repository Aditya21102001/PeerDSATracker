/** Publication state for a community study article. Drafts are visible only to their author. */
export type BlogPostStatus = 'DRAFT' | 'PUBLISHED';

/** A subject-organised article returned by /api/blogs or /api/blogs/mine. */
export interface BlogPost {
  id: number;
  authorId: number;
  title: string;
  subject: string;
  excerpt: string;
  content: string;
  tags: string[];
  status: BlogPostStatus;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  mine: boolean;
}

/** Payload for creating or updating an article. */
export interface BlogPostRequest {
  title: string;
  subject: string;
  excerpt: string;
  content: string;
  tags: string[];
  status: BlogPostStatus;
}
