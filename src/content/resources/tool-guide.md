# 1001 Albums MCP — Tool Usage Guide

## Orientation: start here

Before answering any question about a user's listening history or taste, orient yourself
with one of these tools:

- **`get_tool_guide`** — full workflow guidance for this server. Call this at the start
  of any complex task to see recommended tool sequences and signal weighting.
- **`get_project_stats`** — quick summary of a project: how many albums generated, rated,
  unrated, current album. Use when the question is about progress or status. Also use this
  first to check `albumsGenerated` before launching any heavy analysis — if the project has
  fewer than 10 albums, taste and arc tools will return thin or unreliable results.
- **`get_taste_profile`** — comprehensive taste analysis: top genres, decades, artists,
  rating tendencies, community alignment. Use when the question is about taste, preference,
  or identity as a listener.

For group questions, start with:
- **`get_group`** — group summary, member list, all-time high/low. Always call this first
  for any group question — the member list it returns (with `projectIdentifier` for each
  member) is needed as input for all other group and member-level tools.

---

## Finding and browsing albums

| Question | Tool |
|---|---|
| What is today's album? | `get_album_of_the_day` |
| Browse history with sort and pagination | `list_project_history` (with limit, offset, sortBy) |
| Get full raw history (heavy — read description first) | `list_project_history` (no limit) |
| Find albums by artist, genre, or year | `search_project_history` |
| Get full detail, review, and streaming links for one album | `get_album_detail` |

`list_project_history` and `search_project_history` return a slim format intentionally —
no reviews, no streaming links, no images. Always call `get_album_detail` when you need
a written review, a Spotify/Apple Music link, or full subgenre breakdown.

`search_project_history` uses OR logic for multi-word queries — all terms are searched
independently and any match qualifies. Results are ranked by how many terms they match.
This means you can search for experiential qualities directly: `"raw energy"`,
`"sparse atmospheric"`, or `"orchestral complex"` will surface albums whose genre or
style tags contain any of those words, ranked by relevance.

---

## Understanding an album in context

Use **`get_album_context`** when the question is about a specific album's place in the
user's history. It returns four dimensions:
1. Artist arc — other albums by the same artist, with ratings
2. Musical connections — related albums by genre/style overlap, scored by degree
3. Community divergence — how the user's rating compares to the global average, with
   a baseline of the user's typical divergence pattern
4. Listening journey — the 3 albums before and after in chronological order

Identify the album by name, UUID, or `generatedAlbumId` from `list_project_history`.

`get_album_context` also works for today's current album — pass the album name or UUID
from `get_album_of_the_day` directly. The artist arc and musical connections will still
be computed from your history. Listening journey and personal divergence will be null
since the album hasn't been rated yet.

---

## Taste analysis

| Question | Tool |
|---|---|
| What are my favourite genres/decades? | `get_taste_profile` |
| Am I a harsh or generous rater? | `get_taste_profile` (ratingTendencies) |
| Do I agree or disagree with the community? | `get_taste_profile` (communityAlignment) |
| Which albums did I rate very differently from the community? | `get_rating_outliers` |
| How has my taste evolved over time in distinct phases? | `get_listening_arc` |
| How has my genre exposure shifted across phases of my history? | `get_listening_arc` (top_genres per arc_segment) |
| What does this user value/dislike in a specific genre or with a specific artist? | `get_review_insights` (query pattern) |
| What qualitative context exists for predicting today's album rating? | `get_review_insights` (albumIdentifier pattern) |
| How has my genre exposure evolved over time? | `list_project_history` sorted by generatedAt, then analyse |

`get_rating_outliers` takes a `direction` parameter: "`underrated`" (user rated lower than
community), "`overrated`" (user rated higher), or "`both`". Use "`both`" for open-ended
taste questions, and a specific direction when the user asks about hidden gems or
controversial takes.

---

### Predicting a rating for today's album

**Step 1 — Identify the album**

Call `get_album_of_the_day`. Extract the album name, UUID, genres, styles, and release
year. Note the musical era the album actually belongs to — a 1950s artist recorded live
in 1964 is not meaningfully a "60s album" despite the release date.

**Step 2 — Establish the user's taste character (do this before forming any hypothesis)**

Call `get_rating_outliers`. Read the "overrated by user" list carefully — these are the
albums the user loves more than the community, and they reveal what the user genuinely
responds to. Look for recurring stylistic patterns: energy level, rawness, specific
subgenres, era, format (live vs studio). This list is the most reliable predictor
available and should frame all subsequent interpretation.

**Step 3 — Get qualitative evidence from written reviews**

Call `get_review_insights` with `albumIdentifier` set to today's album name or UUID (from
step 1). Do NOT use the `query` parameter for prediction tasks — the album-anchored call
pattern automatically finds reviews of related albums by genre, style, and artist. Treat
the synthesised output as the primary qualitative signal.

**Step 4 — Get musical context and follow up on connections**

Call `get_album_context` with today's album name or UUID. This works even for unrated
albums — see the tool description. Review the returned connections: artist arc, same-year
companions, shared-genre albums. For any closely connected album — especially one sharing
the same format (live/studio), style, or era — call `get_album_detail` to read the user's
actual review. Do not rely on metadata alone; the review often contains specific language
about what worked or didn't that metadata cannot capture.

**Step 5 — Character search**

Use your understanding of the album's actual character — not just its genre label — to
run one or two targeted `search_project_history` queries for albums that share the same
experiential qualities. Think about what makes this album distinctive: its energy, mood,
instrumentation, cultural origin, format, or the era it actually sounds like rather than
when it was recorded. The 1001 Albums list specifically includes records that were ahead
of their time or defined a moment — genre taxonomy often undersells what makes them
similar to other things in someone's history. Use the results to surface any character-
specific patterns that `get_album_context`'s genre matching may have missed.

**Step 6 — Use aggregate statistics as context, not foundation**

Call `get_taste_profile`. Use decade and genre averages as secondary, contextualising
signals only — not as the basis of the prediction. Flag where they may be misleading:
decade averages conflate musical era with recording date, genre labels are broad, and a
single outlier album can skew averages significantly.

**Step 7 — Arc check (optional, for long histories)**

If the user has a long history and today's album sits outside their apparent comfort zone,
call `get_listening_arc` to check whether recent taste has drifted toward or away from
this style.

**Signal weighting**

When signals conflict, weight them in this order:
1. **Rating outlier patterns** — reveals genuine enthusiasms and aversions, specific and reliable
2. **Written reviews** (via `get_review_insights` and `get_album_detail`) — grounded in actual reactions, specific language is the strongest evidence
3. **Genre/style affinities** from `get_taste_profile` — directionally useful but coarse
4. **Decade averages** — treat with caution; easily confounded by era vs recording date mismatches

**Confidence**

Rate confidence higher when outlier patterns, review evidence, and genre data all point in
the same direction. Rate it lower when they conflict, when the genre is underrepresented
in the user's history (fewer than 5 rated albums in the relevant genre), or when the
album has unusual characteristics that the user's history doesn't clearly address.

**Recommended workflow for open taste questions:**

- "What does this user think of David Bowie?" →
  `get_review_insights({ query: "David Bowie" })`
- "What is this user's relationship with jazz?" →
  `get_review_insights({ query: "Jazz" })`
- "Why does this user rate experimental music so variably?" →
  `get_review_insights({ query: "Experimental" })` then compare with
  `get_rating_outliers` to see if high-divergence albums cluster in that genre

**Recommended workflow for listening-story questions:**

1. `get_listening_arc` → get pre-segmented phases, rolling trends, and milestones
2. `get_taste_profile` → anchor the current-state snapshot (genres, decades, tendencies)
3. Use the `arc_segments` + `milestones` chronologically as chapter beats; narrate from
   the payload rather than recomputing statistics from raw history.

**Recommended workflow for personalized-pitch questions:**

Use the **`personalized-pitch`** prompt template when the user wants to understand why a
specific album is personally relevant to them — before or after listening. This is
distinct from `predict-my-rating` (which forecasts a score) and `todays-album` (which
gives general background). The pitch template chains `get_album_of_the_day` or
`get_album_detail`, `get_taste_profile`, and `get_rating_outliers` automatically.

---

## Comparing two projects

Use **`compare_projects`** when comparing any two projects that may or may not be in the
same group — genre affinity overlap, decade preferences, rating tendency differences, and
shared albums. This is a high-level cross-project tool.

Do not confuse it with **`get_group_member_comparison`**, which is group-scoped and
provides album-level rating divergence between two members of the same group. Use
`compare_projects` for arbitrary project pairs; use `get_group_member_comparison` when
the two projects are group members and you need album-level detail.

---

## Group analysis

Always call `get_group` first to get the member list before calling any other group tool.
The `projectIdentifier` values in `group.members` are the inputs for member-level tools.

| Question | Tool |
|---|---|
| What is the group's current album and how did they rate it? | `get_group_latest_album` |
| Which albums divided the group most? | `get_group_album_insights` |
| Which albums did the group all agree on? | `get_group_album_insights` (mostConsensus) |
| What do all members think of a specific album? | `get_group_album_reviews` — pass UUID directly; name resolution only works for the group's current, latest, and all-time high/low albums |
| Who in the group has most/least compatible taste overall? | `get_group_compatibility_matrix` |
| Compare two specific members in detail | `get_group_member_comparison` |

**Recommended group workflow for "who agrees with whom":**
1. `get_group` → get member list
2. `get_group_compatibility_matrix` → get full pairwise scores and highlights
3. `get_group_member_comparison` → drill into a specific pair for album-level detail (optional — only needed if the user wants more than the matrix provides)

**Recommended group workflow for "what divided us":**
1. `get_group` → get member list
2. `get_group_album_insights` → find most divisive albums
3. `get_group_album_reviews` → get individual reviews for the most divisive album
4. `get_group_member_comparison` → understand which members drove the division (optional drill-down)

---

## The book list and community data

These tools query the global community dataset, not any individual project:

| Question | Tool |
|---|---|
| Top-rated / most controversial / most voted book albums | `list_book_album_stats` (with sortBy and limit) |
| Search book albums by name, artist, genre, or year | `get_book_album_stat` |
| What user-submitted albums exist outside the book? | `list_user_submitted_album_stats` |

These tools return community-wide data only — no individual ratings, no project history.

---

## Cache and data freshness

All data is cached for 4 hours. If a user says their data seems stale or they have just
rated an album and want to see updated results, use **`refresh_data`** with the appropriate
type:
- "`project`" + `projectIdentifier` — refresh one project
- "`group`" + `groupSlug` — refresh one group
- "`global`" — refresh the book album community stats
- "`user`" — refresh the user-submitted album stats
- "`all`" — clear everything

---

## Common mistakes to avoid

- **Don't call `list_project_history` without a limit unless no other tool fits.**
  The full history can be hundreds or thousands of entries. Always check whether
  `get_taste_profile`, `search_project_history`, `get_album_context`,
  `get_rating_outliers`, or `get_review_insights` already answers the question with
  a compact, pre-processed result. Use `get_project_stats` to check `albumsGenerated`
  before deciding to fetch the full list.
- **Don't launch heavy analysis on a thin project.** If `albumsGenerated` is below 10,
  `get_taste_profile`, `get_rating_outliers`, and `get_listening_arc` will return weak
  or unreliable results. Tell the user their history is too short for meaningful analysis
  rather than presenting thin results as authoritative.
- **Don't use listen count as a proxy for preference.** Albums are assigned randomly.
  Always use ratings as the preference signal.
- **Don't skip `get_group` before group tools.** The member `projectIdentifier` list it
  returns is required input for nearly every other group tool.
- **Don't call `list_project_history` when you need reviews or streaming links.** It
  returns a slim format. Use `get_album_detail` for full information.
- **Don't confuse the current album with history.** The `currentAlbum` is unrated and not
  part of `history`. Use `get_album_of_the_day` to retrieve it.
- **Treat similarity scores with low shared album counts cautiously.** A score based on
  2–3 shared albums is not meaningful. Always report `sharedAlbumsCount` alongside any
  similarity score.
- **Don't rely on ratings alone for prediction.** If the user has written reviews,
  `get_review_insights` will give you qualitative reasoning that is often more predictive
  than any rating-based tool. Always check `totalReviewedEntries` in the metadata — if
  it is greater than 0, the user has reviews worth consulting.
- **Don't confuse `compare_projects` with `get_group_member_comparison`.** Use
  `compare_projects` for any two arbitrary projects. Use `get_group_member_comparison`
  when the projects are group members and you need album-level rating divergence within
  that group context.
- **Always synthesise `get_review_insights` output before presenting it.** Whether
  sampling ran or not, read `metadata.samplingUsed`. If `false`, the response contains
  raw reviews with synthesis instructions — complete the synthesis before presenting
  results to the user.
