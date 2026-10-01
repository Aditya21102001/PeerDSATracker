import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BlogPost, BlogPostRequest } from '../models/blog.models';

/** HTTP client for published articles and the signed-in author's private drafts. */
@Injectable({ providedIn: 'root' })
export class BlogService {
  private readonly http = inject(HttpClient);

  published(): Observable<BlogPost[]> {
    return this.http.get<BlogPost[]>('/api/blogs');
  }

  mine(): Observable<BlogPost[]> {
    return this.http.get<BlogPost[]>('/api/blogs/mine');
  }

  create(post: BlogPostRequest): Observable<BlogPost> {
    return this.http.post<BlogPost>('/api/blogs', post);
  }

  update(id: number, post: BlogPostRequest): Observable<BlogPost> {
    return this.http.put<BlogPost>(`/api/blogs/${id}`, post);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`/api/blogs/${id}`);
  }
}
