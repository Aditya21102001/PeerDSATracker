#!/usr/bin/env node
/**
 * Build the Study Articles seed migration from Tech_Interview_Prep.
 *
 * Scans markdown and html files in Tech_Interview_Prep, categorizes them by subject,
 * extracts titles, excerpts, tags, and generates:
 * 1. tools/seed/articles.json
 * 2. backend/src/main/resources/db/migration/V16__seed_study_articles.sql
 *
 * Usage:
 *   node tools/seed/build_study_articles.mjs
 *   node tools/seed/build_study_articles.mjs --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO = path.resolve(__dirname, '../..');
const SOURCE_DIR = path.join(REPO, 'Tech_Interview_Prep');
const JSON_OUT = path.join(__dirname, 'articles.json');
const SQL_OUT = path.join(REPO, 'backend/src/main/resources/db/migration/V16__seed_study_articles.sql');

const checkOnly = process.argv.includes('--check');

function determineSubjectAndTags(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const top = parts[0] || '';
  const sub = parts[1] || '';

  let subject = 'Technical Interview';
  let tags = [top.toLowerCase()];

  if (top === 'java') {
    if (sub === 'oops') {
      subject = 'Java OOP & Design';
      tags.push('java', 'oops', 'polymorphism', 'inheritance');
    } else if (sub === 'multithreading') {
      subject = 'Java Concurrency & Threads';
      tags.push('java', 'concurrency', 'threads', 'multithreading');
    } else if (sub === 'Java_8') {
      subject = 'Java 8+ & Functional';
      tags.push('java', 'java8', 'streams', 'lambda');
    } else if (sub === 'collections') {
      subject = 'Java Collections Framework';
      tags.push('java', 'collections', 'hashmap', 'generics');
    } else if (sub === 'exception' || sub === 'exceptionHandling') {
      subject = 'Java Exception Handling';
      tags.push('java', 'exceptions', 'error-handling');
    } else if (sub === 'coreJava') {
      subject = 'Core Java Fundamentals';
      tags.push('java', 'core-java', 'jvm', 'memory');
    } else if (sub === 'Project1') {
      subject = 'Java Project Architecture';
      tags.push('java', 'architecture', 'microservices');
    } else {
      subject = 'Java Programming';
      tags.push('java', 'backend');
    }
  } else if (top === 'SpringbootDaily') {
    if (sub === 'SpringBootBasics') {
      subject = 'Spring Boot Fundamentals';
      tags.push('spring-boot', 'spring', 'ioc', 'beans');
    } else if (sub === 'SpringSecurity') {
      subject = 'Spring Security & Auth';
      tags.push('spring-boot', 'security', 'jwt', 'oauth');
    } else if (sub === 'SpringCloud') {
      subject = 'Spring Cloud & Microservices';
      tags.push('spring-boot', 'microservices', 'cloud');
    } else if (sub === 'kafka') {
      subject = 'Apache Kafka & Messaging';
      tags.push('kafka', 'messaging', 'event-driven');
    } else if (sub === 'springbootSenerios') {
      subject = 'Spring Boot Scenarios';
      tags.push('spring-boot', 'interview', 'scenarios');
    } else if (sub === 'springbootGeneral') {
      subject = 'Spring Boot Deep Dives';
      tags.push('spring-boot', 'resilience', 'production');
    } else {
      subject = 'Spring Boot';
      tags.push('spring-boot', 'backend', 'java');
    }
  } else if (top === 'Database') {
    if (sub === 'SQL_Queries') {
      subject = 'SQL & Query Optimization';
      tags.push('sql', 'database', 'queries', 'indexing');
    } else if (sub === 'hibernate') {
      subject = 'Hibernate & JPA ORM';
      tags.push('hibernate', 'jpa', 'orm', 'database');
    } else if (sub === 'Jdbc') {
      subject = 'JDBC & Connection Pooling';
      tags.push('jdbc', 'database', 'sql');
    } else {
      subject = 'Database Systems & Design';
      tags.push('database', 'rdbms', 'postgresql', 'mysql');
    }
  } else if (top === 'systemDesign') {
    if (sub === 'UrlShortner') {
      subject = 'System Design: URL Shortener';
      tags.push('system-design', 'architecture', 'caching');
    } else {
      subject = 'System Design & Architecture';
      tags.push('system-design', 'architecture', 'distributed-systems');
    }
  } else if (top === 'Python') {
    if (sub === 'IKS interview') {
      subject = 'Python Interview Scenarios';
      tags.push('python', 'interview', 'backend');
    } else {
      subject = 'Python Programming';
      tags.push('python', 'fastapi', 'asyncio');
    }
  } else if (top === 'DSA_Topics') {
    if (sub === 'Arrays') {
      subject = 'DSA: Arrays & Strings';
      tags.push('dsa', 'arrays', 'algorithms');
    } else if (sub === 'DailyProblems') {
      subject = 'DSA: Problem Walkthroughs';
      tags.push('dsa', 'leetcode', 'problem-solving');
    } else if (sub === 'SegmentTree') {
      subject = 'DSA: Advanced Trees';
      tags.push('dsa', 'trees', 'segment-tree');
    } else {
      subject = 'Data Structures & Algorithms';
      tags.push('dsa', 'algorithms', 'problem-solving');
    }
  } else if (top === 'Testing') {
    subject = 'Testing & Quality Assurance';
    tags.push('testing', 'junit', 'mockito', 'tdd');
  } else if (top === 'Transactional') {
    subject = 'Distributed Transactions';
    tags.push('transactions', 'saga', 'distributed', 'acid');
  } else if (top === 'bankSaudiFransi') {
    subject = 'Case Studies: Banking & KYC Architecture';
    tags.push('case-study', 'banking', 'architecture', 'kafka');
  } else if (top === 'CodeSnippets') {
    subject = 'Technical Code Snippets';
    tags.push('code-snippets', 'syntax', 'cheat-sheet');
  } else if (top === 'Interview') {
    subject = 'Fullstack & Web Prep';
    tags.push('frontend', 'angular', 'web', 'interview');
  }

  const cleanTags = [];
  const seen = new Set();
  for (const t of tags) {
    const cleaned = t.replace(/[^a-zA-Z0-9_-]/g, '').trim().toLowerCase();
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      cleanTags.push(cleaned);
    }
  }

  return { subject, tags: cleanTags.slice(0, 8) };
}

function humanizeName(nameStem) {
  let s = nameStem.replace(/[-_]+/g, ' ');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  const replacements = {
    Aop: 'AOP',
    Db: 'Database',
    Rlo: 'Record-Level Locking',
    Jvm: 'JVM',
    Junit: 'JUnit',
    Mokito: 'Mockito',
    Opps: 'OOP',
    Oops: 'OOP',
    Api: 'API',
    Sql: 'SQL',
    Jdbc: 'JDBC',
    Jpa: 'JPA',
    Dsa: 'DSA',
    Kyc: 'KYC',
    Lru: 'LRU',
    Ldap: 'LDAP',
    Jwt: 'JWT',
    Solid: 'SOLID',
    Url: 'URL',
    Qa: 'Q&A',
  };

  const words = s.split(/\s+/).map((w) => {
    const cap = w.charAt(0).toUpperCase() + w.slice(1);
    return replacements[cap] || cap;
  });
  return words.join(' ').trim();
}

function extractTitleAndExcerpt(rawContent, fallbackTitle) {
  const lines = rawContent.split(/\r?\n/);
  let title = '';
  const excerptLines = [];

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const stripped = lines[i].trim();
    if (stripped.startsWith('#')) {
      let candidate = stripped.replace(/^#+\s*/, '');
      candidate = candidate.replace(/[*_`]/g, '');
      // Strip emojis
      candidate = candidate.replace(/[^\w\s():\-/.,?!]/g, '').trim();
      if (candidate.length >= 3 && candidate.length <= 120 && !candidate.toLowerCase().startsWith('table of contents')) {
        title = candidate;
        break;
      }
    }
  }

  if (!title) {
    title = fallbackTitle;
  }

  let inCodeBlock = false;
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || !stripped) continue;
    if (stripped.startsWith('#') || stripped.startsWith('---') || stripped.startsWith('===')) continue;

    let cleaned = stripped.replace(/^[>\-*0-9.\s]+/, '');
    cleaned = cleaned.replace(/[*_`]/g, '').trim();
    if (cleaned.length > 20) {
      excerptLines.push(cleaned);
      if (excerptLines.join(' ').length >= 140) break;
    }
  }

  let excerpt = excerptLines.join(' ');
  if (excerpt.length > 280) {
    excerpt = excerpt.slice(0, 277) + '...';
  }
  if (!excerpt) {
    excerpt = `Technical interview notes and deep dive on ${title}.`;
  }

  return {
    title: title.slice(0, 180),
    excerpt: excerpt.slice(0, 500),
  };
}

function escapeSqlLiteral(val) {
  return "'" + val.replace(/'/g, "''") + "'";
}

function walkDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseAllArticles(sourceDir) {
  const files = walkDir(sourceDir);
  const articles = [];

  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    if (ext !== '.md' && ext !== '.html') continue;

    const stats = fs.statSync(fullPath);
    if (stats.size === 0) continue;

    const relPath = path.relative(sourceDir, fullPath);
    const content = fs.readFileSync(fullPath, 'utf-8').trim();
    if (!content || content.length < 10) continue;

    const stem = path.basename(fullPath, ext);
    const fallbackTitle = humanizeName(stem);
    const { subject, tags } = determineSubjectAndTags(relPath);
    const { title, excerpt } = extractTitleAndExcerpt(content, fallbackTitle);

    articles.push({
      relPath: relPath.replace(/\\/g, '/'),
      title,
      subject,
      excerpt,
      content,
      tags,
      length: content.length,
    });
  }

  // Ensure unique (subject, title) pairs
  const titleCounts = new Map();
  for (const a of articles) {
    const key = `${a.subject}|||${a.title}`;
    titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
  }
  for (const a of articles) {
    const key = `${a.subject}|||${a.title}`;
    if (titleCounts.get(key) > 1) {
      const stem = path.basename(a.relPath, path.extname(a.relPath));
      if (stem.toLowerCase().endsWith('2') || stem.toLowerCase().includes('part2')) {
        a.title = `${a.title} (Part 2)`;
      } else {
        a.title = `${a.title} (Part 1)`;
      }
    }
  }

  articles.sort((a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title));
  return articles;
}

function buildSql(articles) {
  const lines = [
    '-- V16__seed_study_articles.sql',
    '-- Seed comprehensive technical interview prep articles and guides from Tech_Interview_Prep.',
    "-- Attributed to 'aditya' (PeerDSA Editorial). Idempotent migration.",
    '',
    '-- Ensure editorial author exists in users table',
    'INSERT INTO users (email, username, password_hash, display_name, role)',
    'SELECT',
    "    'editorial@peerdsa.com',",
    "    'aditya',",
    "    '$2a$10$e84WbH6m2y8p0bL0T34q3OPiA7pWcO2h12V7J4V91wI90xGfWJ.K2',",
    "    'Aditya (PeerDSA Editorial)',",
    "    'ADMIN'",
    'WHERE NOT EXISTS (',
    "    SELECT 1 FROM users WHERE lower(username) = 'aditya' OR lower(email) = 'editorial@peerdsa.com'",
    ');',
    '',
  ];

  const batchSize = 25;
  for (let batchIdx = 0; batchIdx < articles.length; batchIdx += batchSize) {
    const batch = articles.slice(batchIdx, batchIdx + batchSize);
    lines.push(`-- Batch ${Math.floor(batchIdx / batchSize) + 1}`);
    lines.push('WITH author AS (');
    lines.push('    SELECT id FROM users');
    lines.push("    WHERE lower(username) = 'aditya' OR lower(email) = 'editorial@peerdsa.com'");
    lines.push("    ORDER BY CASE WHEN lower(username) = 'aditya' THEN 1 ELSE 2 END");
    lines.push('    LIMIT 1');
    lines.push(')');
    lines.push('INSERT INTO blog_posts (user_id, title, subject, excerpt, content, tags, status, published_at, created_at, updated_at)');
    lines.push('SELECT');
    lines.push('    author.id,');
    lines.push('    v.title,');
    lines.push('    v.subject,');
    lines.push('    v.excerpt,');
    lines.push('    v.content,');
    lines.push('    v.tags,');
    lines.push("    'PUBLISHED',");
    lines.push('    now(),');
    lines.push('    now(),');
    lines.push('    now()');
    lines.push('FROM author, (VALUES');

    const valueEntries = [];
    for (const a of batch) {
      const titleEsc = escapeSqlLiteral(a.title);
      const subjEsc = escapeSqlLiteral(a.subject);
      const excEsc = escapeSqlLiteral(a.excerpt);
      const contentEsc = escapeSqlLiteral(a.content);
      const tagsEsc = escapeSqlLiteral(a.tags.join(','));
      valueEntries.push(`    (${titleEsc}, ${subjEsc}, ${excEsc}, ${contentEsc}, ${tagsEsc})`);
    }

    lines.push(valueEntries.join(',\n'));
    lines.push(') AS v(title, subject, excerpt, content, tags)');
    lines.push('WHERE NOT EXISTS (');
    lines.push('    SELECT 1 FROM blog_posts bp WHERE bp.title = v.title AND bp.subject = v.subject');
    lines.push(');');
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Error: ${SOURCE_DIR} does not exist`);
    process.exit(1);
  }

  const articles = parseAllArticles(SOURCE_DIR);
  console.log(`Parsed ${articles.length} articles from ${SOURCE_DIR}`);

  const subjectsCount = {};
  for (const a of articles) {
    subjectsCount[a.subject] = (subjectsCount[a.subject] || 0) + 1;
  }

  console.log('\nSubject breakdown:');
  const sortedSubjs = Object.entries(subjectsCount).sort((a, b) => b[1] - a[1]);
  for (const [subj, count] of sortedSubjs) {
    console.log(`  ${subj.padEnd(40)}: ${count} articles`);
  }

  if (checkOnly) {
    console.log('\nCheck mode complete. No files written.');
    return;
  }

  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(articles, null, 2), 'utf-8');
  console.log(`\nWrote JSON metadata to ${JSON_OUT} (${fs.statSync(JSON_OUT).size.toLocaleString()} bytes)`);

  fs.mkdirSync(path.dirname(SQL_OUT), { recursive: true });
  const sql = buildSql(articles);
  fs.writeFileSync(SQL_OUT, sql, 'utf-8');
  console.log(`Wrote SQL migration to ${SQL_OUT} (${fs.statSync(SQL_OUT).size.toLocaleString()} bytes)`);
}

main();
