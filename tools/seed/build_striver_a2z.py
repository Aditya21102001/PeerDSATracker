"""Build the Striver A2Z sheet seed migration.

The takeuforward sheet page is a Next.js RSC ("flight") stream. The full sheet --
18 steps, 62 sub-steps, 474 problems -- is embedded in the page as a sequence of
`self.__next_f.push([1,"<chunk>"])` calls whose second element is a JS string
literal. Concatenating the *decoded* chunks reconstructs the flight text, which
contains the categories array verbatim.

This is scraping an undocumented payload: if takeuforward changes their page,
this breaks. It is a build-time tool, not a runtime dependency -- the generated
SQL is committed, so a broken scrape never affects the running app.

Usage:
    python build_striver_a2z.py                  # fetch live, write json + sql
    python build_striver_a2z.py --html page.html # parse a saved copy
    python build_striver_a2z.py --check          # parse only, print stats
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import urllib.request

SHEET_URL = "https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2"

# RSC encodes an absent value as the string "$undefined" rather than null.
UNDEF = "$undefined"

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
JSON_OUT = HERE / "problems.json"
SQL_OUT = REPO / "backend" / "src" / "main" / "resources" / "db" / "migration" / "V2__seed_sheet.sql"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (peerdsa-seed)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def match_array(s: str, start: int) -> str:
    """Return the balanced JSON array beginning at s[start] == '['."""
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
    raise ValueError("unbalanced array in flight payload")


def extract_sections(html: str) -> list[dict]:
    chunks = re.findall(r'self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\s*\]\)', html, re.S)
    if not chunks:
        raise SystemExit("no RSC flight chunks found -- the page layout changed")
    flight = "".join(json.loads(c) for c in chunks)

    idx = flight.find('"category_id"')
    if idx < 0:
        raise SystemExit('no "category_id" in flight payload -- the data shape changed')
    arr_start = flight.rfind("[", 0, flight.rfind("{", 0, idx))
    return json.loads(match_array(flight, arr_start))


def clean(v) -> str | None:
    """RSC absent-value sentinel -> None."""
    if v is None or v == UNDEF or v == "":
        return None
    return v


def slugify(text: str) -> str:
    # Topic name = the category label before any bracketed qualifier.
    # "Binary Search [1D, 2D Arrays, Search Space]" -> "Binary Search"
    base = text.split("[")[0].strip()
    slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
    return slug


def topic_name(text: str) -> str:
    return text.split("[")[0].strip()


def sql_str(v: str | None) -> str:
    if v is None:
        return "NULL"
    return "'" + v.replace("'", "''") + "'"


def build(sections: list[dict]) -> dict:
    steps, sub_steps, problems, topics, problem_topics = [], [], [], {}, []
    sub_id = 0
    prob_id = 0

    for step_idx, cat in enumerate(sections, start=1):
        name = cat["category_name"]
        steps.append({"id": step_idx, "step_no": step_idx, "title": name, "position": step_idx})

        # Two distinct steps are both named "Strings" in A2Z; they share one topic.
        slug = slugify(name)
        if slug not in topics:
            topics[slug] = {"id": len(topics) + 1, "name": topic_name(name), "slug": slug}
        topic_id = topics[slug]["id"]

        for sub_idx, sub in enumerate(cat.get("subcategories", []), start=1):
            sub_id += 1
            sub_steps.append(
                {
                    "id": sub_id,
                    "step_id": step_idx,
                    "title": sub["subcategory_name"],
                    "position": sub_idx,
                }
            )

            for p_idx, p in enumerate(sub.get("problems", []), start=1):
                prob_id += 1
                plus = clean(p.get("plus"))
                problems.append(
                    {
                        "id": prob_id,
                        "sub_step_id": sub_id,
                        "title": p["problem_name"],
                        # Source data mixes "Easy" and "easy".
                        "difficulty": p["difficulty"].strip().upper(),
                        "position": p_idx,
                        "leetcode_url": clean(p.get("leetcode")),
                        # The `link` field is "$undefined" for all 474 rows; there is
                        # no GFG URL in this payload.
                        "gfg_url": None,
                        "youtube_url": clean(p.get("youtube")),
                        "article_url": clean(p.get("article")),
                        "external_slug": plus.rsplit("/", 1)[-1] if plus else None,
                    }
                )
                problem_topics.append({"problem_id": prob_id, "topic_id": topic_id})

    return {
        "steps": steps,
        "sub_steps": sub_steps,
        "topics": list(topics.values()),
        "problems": problems,
        "problem_topics": problem_topics,
    }


def emit_sql(d: dict) -> str:
    out: list[str] = [
        "-- Striver A2Z sheet seed. GENERATED by tools/seed/build_striver_a2z.py -- do not edit by hand.",
        f"-- {len(d['steps'])} steps, {len(d['sub_steps'])} sub-steps, {len(d['problems'])} problems.",
        "",
    ]

    out.append("INSERT INTO sheet_steps (id, step_no, title, position) VALUES")
    out.append(
        ",\n".join(
            f"  ({s['id']}, {s['step_no']}, {sql_str(s['title'])}, {s['position']})" for s in d["steps"]
        )
        + ";"
    )
    out.append("")

    out.append("INSERT INTO topics (id, name, slug) VALUES")
    out.append(
        ",\n".join(f"  ({t['id']}, {sql_str(t['name'])}, {sql_str(t['slug'])})" for t in d["topics"]) + ";"
    )
    out.append("")

    out.append("INSERT INTO sheet_sub_steps (id, step_id, title, position) VALUES")
    out.append(
        ",\n".join(
            f"  ({s['id']}, {s['step_id']}, {sql_str(s['title'])}, {s['position']})" for s in d["sub_steps"]
        )
        + ";"
    )
    out.append("")

    out.append(
        "INSERT INTO problems (id, sub_step_id, title, difficulty, position, "
        "leetcode_url, gfg_url, youtube_url, article_url, external_slug) VALUES"
    )
    out.append(
        ",\n".join(
            f"  ({p['id']}, {p['sub_step_id']}, {sql_str(p['title'])}, {sql_str(p['difficulty'])}, "
            f"{p['position']}, {sql_str(p['leetcode_url'])}, {sql_str(p['gfg_url'])}, "
            f"{sql_str(p['youtube_url'])}, {sql_str(p['article_url'])}, {sql_str(p['external_slug'])})"
            for p in d["problems"]
        )
        + ";"
    )
    out.append("")

    out.append("INSERT INTO problem_topics (problem_id, topic_id) VALUES")
    out.append(",\n".join(f"  ({pt['problem_id']}, {pt['topic_id']})" for pt in d["problem_topics"]) + ";")
    out.append("")

    # Explicit ids were inserted, so the bigserial sequences must be advanced or
    # the first runtime insert collides on the primary key.
    out.append("-- Advance sequences past the explicitly-inserted ids.")
    for table in ("sheet_steps", "topics", "sheet_sub_steps", "problems"):
        out.append(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f"(SELECT MAX(id) FROM {table}));"
        )
    out.append("")
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="parse a saved copy instead of fetching")
    ap.add_argument("--check", action="store_true", help="parse and print stats, write nothing")
    args = ap.parse_args()

    html = pathlib.Path(args.html).read_text(encoding="utf-8", errors="replace") if args.html else fetch(SHEET_URL)
    data = build(extract_sections(html))

    n_steps, n_subs, n_probs = len(data["steps"]), len(data["sub_steps"]), len(data["problems"])
    diffs: dict[str, int] = {}
    for p in data["problems"]:
        diffs[p["difficulty"]] = diffs.get(p["difficulty"], 0) + 1

    print(f"steps={n_steps} sub_steps={n_subs} problems={n_probs} topics={len(data['topics'])}")
    print(f"difficulty={diffs}")
    print(f"with leetcode_url={sum(1 for p in data['problems'] if p['leetcode_url'])}")

    bad = sorted(set(diffs) - {"EASY", "MEDIUM", "HARD"})
    if bad:
        raise SystemExit(f"unexpected difficulty values (violates CHECK constraint): {bad}")
    if n_steps != 18:
        print(f"warning: expected 18 steps, got {n_steps}", file=sys.stderr)

    if args.check:
        return

    JSON_OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    SQL_OUT.write_text(emit_sql(data), encoding="utf-8")
    print(f"wrote {JSON_OUT.relative_to(REPO)}")
    print(f"wrote {SQL_OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
