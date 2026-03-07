# 1001 Albums You Must Hear Before You Die — Concept Guide

## The Book

"1001 Albums You Must Hear Before You Die" is a reference book first published in 2003 and
edited by Robert Dimery. It presents a curated list of approximately 1001 albums judged by
a panel of music critics to be essential listening — not a popularity chart or a ranking,
but a deliberately broad survey of recorded music history across genres, decades, and
cultures.

The list spans from the 1950s to the present day and covers rock, jazz, pop, classical,
electronic, hip-hop, world music, and more. It is periodically revised: newer editions add
recent releases and occasionally remove older entries, so the list is not entirely fixed.
When users or tools refer to "book albums" or "the canonical list", they mean the albums
drawn from this book.

The book's goal is breadth and cultural significance over personal taste. An album being on
the list does not mean it is universally loved — it means it is considered important,
influential, or representative of its era or genre. Users will frequently encounter albums
they have never heard of, in genres they do not usually enjoy.

## The 1001 Albums Generator

1001 Albums Generator (https://1001albumsgenerator.com) is a web application built around
the book's list. Its core mechanic is simple: it assigns users one album at a time, chosen
randomly from the list, and asks them to listen to it and rate it.

Key facts about how it works:

- **Albums are assigned randomly.** Users do not choose what they listen to. Each day (or
  week, depending on settings) the generator picks the next album. This is fundamental to
  understanding the data: a user's listening history is not a reflection of their taste
  preferences — it is a random walk through music history. Listen count alone tells you
  nothing about what a user likes.

- **Ratings are 1–5.** After listening, users rate the album from 1 (lowest) to 5
  (highest). Ratings are the primary signal of preference. An unrated album means the user
  has not yet rated it — typically because it is the current album or they skipped rating.

- **Reviews are optional.** Users can write a short text review alongside their rating.
  Reviews are personal and qualitative — they are the richest source of insight into how a
  user experienced an album.

- **The current album is unrated.** The album assigned today has not yet been rated. It
  appears as \`currentAlbum\` in the project data. Do not confuse it with historical rated
  albums.

- **User-submitted albums.** In addition to the ~1001 book albums, users can submit albums
  that are not in the original book. These appear in a separate dataset. They are a niche
  feature and most projects will be dominated by book albums.

- **Update frequency varies.** Some users listen daily, others weekly. The \`generatedAt\`
  field on each history entry records when that album was assigned, not when it was
  listened to or rated.

## Projects

A "project" is an individual user's instance of the challenge. Each project has:
- A name and an optional sharerId (an anonymised identifier for sharing without revealing
  the project name)
- A listening history: the ordered list of albums the generator has assigned, with ratings
  and reviews
- A current album: the album currently assigned, not yet rated
- Optional group membership

When calling tools, the \`projectIdentifier\` can be either the project name or the sharerId.
If you have both, either works.

## Groups

A "group" is a collection of projects participating in the challenge together. Group members
receive the same album assignments, allowing them to compare their reactions to the same
music. Groups are identified by a \`groupSlug\` — the group name in lowercase with hyphens
instead of spaces, visible in the group page URL.

Groups enable social features: comparing ratings, finding the most divisive albums, and
understanding taste compatibility across members.

## The Community

The global community rating for each album is the average rating across all 1001 Albums
Generator users worldwide who have rated that album. This provides a baseline to compare
any individual's or group's rating against. A high community rating means most users who
heard this album liked it; a low one means most did not — though remember, all users are
assigned albums randomly, so community ratings reflect reactions from a diverse and
unself-selected audience.

## What "affinity" means in this context

Because albums are assigned randomly, genre and decade affinity must be inferred from
ratings, not from listen counts. If a user has heard 10 jazz albums and rated them all
highly, that signals genuine affinity for jazz. If they have heard 10 jazz albums and rated
them all poorly, high listen count would be misleading — the correct signal is the average
rating. All affinity computations in this server use average rating per genre/decade/artist,
not raw listen counts.
