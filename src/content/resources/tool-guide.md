# 1001 Albums MCP — Tool Usage Guide

## Orientation: start here

Before answering any question about a user's listening history or taste, orient yourself
with one of these two tools:

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

`get_rating_outliers` takes a `direction` parameter: "`underrated`" (user rated lower than
community), "`overrated`" (user rated higher), or "`both`". Use "`both`" for open-ended
taste questions, and a specific direction when the user asks about hidden gems or
controversial takes.

---

## Using review insights for rating prediction

Numerical rating tools (`get_taste_profile`, `get_rating_outliers`) tell you *what* a
user rated. `get_review_insights` tells you *why* — which is often more predictive.

**Recommended workflow for `predict-my-rating`:**

1. `get_album_of_the_day` → get today's album name, genres, styles, artist
2. `get_taste_profile` → baseline numerical picture
3. `get_album_context` → artist arc and musical connections with their ratings
4. `get_review_insights` with `albumIdentifier` = today's album → qualitative synthesis
   of reviews from stylistically connected albums in the user's history
5. Weigh the synthesis from step 4 alongside the numbers from steps 2–3.
   When review reasoning and numerical scores conflict, the review reasoning is usually
   the more reliable signal — a 2/5 with a review saying "I normally love this genre"
   tells you more than the 2/5 alone.

Note: `get_review_insights` attempts MCP Sampling but most clients including Claude
Desktop do not currently support it. When sampling is unavailable, the tool returns the
raw reviews with explicit synthesis instructions embedded in the response — follow those
instructions to produce the synthesis yourself. Check `metadata.samplingUsed` to know
which path ran. Either way, do not present the raw review block directly to the user.

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
- "`group`" + `groupSlug\` — refresh one group
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

---

## Finding and browsing albums

| Question | Tool |
|---|---|
| What is today's album? | \`get_album_of_the_day\` |
| Browse history with sort and pagination | `list_project_history` (with limit, offset, sortBy) |
| Get full raw history (heavy — read description first) | `list_project_history` (no limit) |
| Find albums by artist, genre, or year | \`search_project_history\` |
| Get full detail, review, and streaming links for one album | \`get_album_detail\` |

\`list_project_history\` and \`search_project_history\` return a slim format intentionally —
no reviews, no streaming links, no images. Always call \`get_album_detail\` when you need
a written review, a Spotify/Apple Music link, or full subgenre breakdown.

---

## Understanding an album in context

Use **\`get_album_context\`** when the question is about a specific album's place in the
user's history. It returns four dimensions:
1. Artist arc — other albums by the same artist, with ratings
2. Musical connections — related albums by genre/style overlap, scored by degree
3. Community divergence — how the user's rating compares to the global average, with
   a baseline of the user's typical divergence pattern
4. Listening journey — the 3 albums before and after in chronological order

Identify the album by name, UUID, or \`generatedAlbumId\` from \`list_project_history\`.

\`get_album_context\` also works for today's current album — pass the album name or UUID
from \`get_album_of_the_day\` directly. The artist arc and musical connections will still
be computed from your history. Listening journey and personal divergence will be null
since the album hasn't been rated yet.

---

## Taste analysis

| Question | Tool |
|---|---|
| What are my favourite genres/decades? | \`get_taste_profile\` |
| Am I a harsh or generous rater? | \`get_taste_profile\` (ratingTendencies) |
| Do I agree or disagree with the community? | \`get_taste_profile\` (communityAlignment) |
| Which albums did I rate very differently from the community? | \`get_rating_outliers\` |
| How has my taste evolved over time in distinct phases? | \`get_listening_arc\` |
| What does this user value/dislike in a specific genre or with a specific artist? | \`get_review_insights\` (query pattern) |
| What qualitative context exists for predicting today's album rating? | \`get_review_insights\` (albumIdentifier pattern) |
| How has my genre exposure evolved over time? | \`list_project_history\` sorted by generatedAt, then analyse |

\`get_rating_outliers\` takes a \`direction\` parameter: "\`underrated\`" (user rated lower than
community), "\`overrated\`" (user rated higher), or "\`both\`". Use "\`both\`" for open-ended
taste questions, and a specific direction when the user asks about hidden gems or
controversial takes.

---

## Using review insights for rating prediction

Numerical rating tools (`get_taste_profile`, `get_rating_outliers`) tell you *what* a
user rated. `get_review_insights` tells you *why* — which is often more predictive.

**Recommended workflow for `predict-my-rating`:**

1. `get_album_of_the_day` → get today's album name, genres, styles, artist
2. `get_taste_profile` → baseline numerical picture
3. `get_album_context` → artist arc and musical connections with their ratings
4. `get_review_insights` with `albumIdentifier` = today's album → qualitative synthesis
   of reviews from stylistically connected albums in the user's history
5. Weigh the synthesis from step 4 alongside the numbers from steps 2–3.
   When review reasoning and numerical scores conflict, the review reasoning is usually
   the more reliable signal — a 2/5 with a review saying "I normally love this genre"
   tells you more than the 2/5 alone.

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
3. Use the `arc_segments` + `milestones` chronologically as chapter beats; narrate from the payload rather than recomputing statistics from raw history.

---

## Group analysis

Always call \`get_group\` first to get the member list before calling any other group tool.
The \`projectIdentifier\` values in \`group.members\` are the inputs for member-level tools.

| Question | Tool |
|---|---|
| What is the group's current album and how did they rate it? | \`get_group_latest_album\` |
| Which albums divided the group most? | \`get_group_album_insights\` |
| Which albums did the group all agree on? | \`get_group_album_insights\` (mostConsensus) |
| What do all members think of a specific album? | \`get_group_album_reviews\` — pass UUID directly; name resolution only works for the group's current, latest, and all-time high/low albums |
| Who in the group has most/least compatible taste overall? | \`get_group_compatibility_matrix\` |
| Compare two specific members in detail | \`get_group_member_comparison\` |

**Recommended group workflow for "who agrees with whom":**
1. \`get_group\` → get member list
2. \`get_group_compatibility_matrix\` → get full pairwise scores and highlights
3. \`get_group_member_comparison\` → drill into a specific pair for album-level detail

**Recommended group workflow for "what divided us":**
1. \`get_group\` → get member list
2. \`get_group_album_insights\` → find most divisive albums
3. \`get_group_album_reviews\` → get individual reviews for the most divisive album
4. \`get_group_member_comparison\` → understand which members drove the division

---

## The book list and community data

These tools query the global community dataset, not any individual project:

| Question | Tool |
|---|---|
| Top-rated / most controversial / most voted book albums | `list_book_album_stats` (with sortBy and limit) |
| Search book albums by name, artist, genre, or year | `get_book_album_stat` |
| What user-submitted albums exist outside the book? | \`list_user_submitted_album_stats\` |

These tools return community-wide data only — no individual ratings, no project history.

---

## Cache and data freshness

All data is cached for 4 hours. If a user says their data seems stale or they have just
rated an album and want to see updated results, use **\`refresh_data\`** with the appropriate
type:
- "\`project\`" + \`projectIdentifier\` — refresh one project
- "\`group\`" + \`groupSlug\` — refresh one group
- "\`global\`" — refresh the book album community stats
- "\`user\`" — refresh the user-submitted album stats
- "\`all\`" — clear everything

---

## Common mistakes to avoid

- **Don't call `list_project_history` without a limit unless no other tool fits.**
  The full history can be hundreds or thousands of entries. Always check whether
  `get_taste_profile`, `search_project_history`, `get_album_context`,
  `get_rating_outliers`, or `get_review_insights` already answers the question with
  a compact, pre-processed result. Use `get_project_stats` to check `albumsGenerated`
  before deciding to fetch the full list.
- **Don't use listen count as a proxy for preference.** Albums are assigned randomly.
  Always use ratings as the preference signal.
- **Don't skip \`get_group\` before group tools.** The member \`projectIdentifier\` list it
  returns is required input for nearly every other group tool.
- **Don't call \`list_project_history\` when you need reviews or streaming links.** It
  returns a slim format. Use \`get_album_detail\` for full information.
- **Don't confuse the current album with history.** The \`currentAlbum\` is unrated and not
  part of \`history\`. Use \`get_album_of_the_day\` to retrieve it.
- **Treat similarity scores with low shared album counts cautiously.** A score based on
  2–3 shared albums is not meaningful. Always report \`sharedAlbumsCount\` alongside any
  similarity score.
- **Don't rely on ratings alone for prediction.** If the user has written reviews,
  `get_review_insights` will give you qualitative reasoning that is often more predictive
  than any rating-based tool. Always check `totalReviewedEntries` in the metadata — if
  it is greater than 0, the user has reviews worth consulting.

