# 1001 Albums MCP — Tool Usage Guide

## Orientation: start here

Before answering any question about a user's listening history or taste, orient yourself
with one of these two tools:

- **\`get_project_stats\`** — quick summary of a project: how many albums generated, rated,
  unrated, current album. Use when the question is about progress or status.
- **\`get_taste_profile\`** — comprehensive taste analysis: top genres, decades, artists,
  rating tendencies, community alignment. Use when the question is about taste, preference,
  or identity as a listener.

For group questions, start with:
- **\`get_group\`** — group summary, member list, all-time high/low. Always call this first
  for any group question — the member list it returns (with \`projectIdentifier\` for each
  member) is needed as input for all other group and member-level tools.

---

## Finding and browsing albums

| Question | Tool |
|---|---|
| What is today's album? | \`get_album_of_the_day\` |
| Show me my full history | \`list_project_history\` |
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

---

## Taste analysis

| Question | Tool |
|---|---|
| What are my favourite genres/decades? | \`get_taste_profile\` |
| Am I a harsh or generous rater? | \`get_taste_profile\` (ratingTendencies) |
| Do I agree or disagree with the community? | \`get_taste_profile\` (communityAlignment) |
| Which albums did I rate very differently from the community? | \`get_rating_outliers\` |
| How has my genre exposure evolved over time? | \`list_project_history\` sorted by generatedAt, then analyse |

\`get_rating_outliers\` takes a \`direction\` parameter: "\`underrated\`" (user rated lower than
community), "\`overrated\`" (user rated higher), or "\`both\`". Use "\`both\`" for open-ended
taste questions, and a specific direction when the user asks about hidden gems or
controversial takes.

---

## Group analysis

Always call \`get_group\` first to get the member list before calling any other group tool.
The \`projectIdentifier\` values in \`group.members\` are the inputs for member-level tools.

| Question | Tool |
|---|---|
| What is the group's current album and how did they rate it? | \`get_group_latest_album\` |
| Which albums divided the group most? | \`get_group_album_insights\` |
| Which albums did the group all agree on? | \`get_group_album_insights\` (mostConsensus) |
| What do all members think of a specific album? | \`get_group_album_reviews\` |
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
| What are the highest-rated book album globally? | \`list_book_album_stats\` |
| How does the community rate a specific book album? | \`get_book_album_stat\` |
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

