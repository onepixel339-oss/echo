# AniList Terms Clarification Request (L-3)

**Status: PREPARED — NOT SENT.** Sending requires explicit owner approval
(Transformation Plan Revision 1.3 §7.3.3 / §12.2 stage A0). Do not send this
letter without the owner's sign-off.

**To:** contact@anilist.co
**Subject:** Terms-of-use clarification request — small non-commercial
local-first media taste app (4 questions)

---

Dear AniList team,

I am the developer of **ECHO**, a small, personal, non-commercial,
local-first web application that charts a user's taste across the media they
enjoy (anime and manga among movies, series, games, books and comics) as an
explorable map. ECHO uses the AniList GraphQL API strictly as a live,
interactive search and details source: the user's browser queries AniList
when they search for a title, results are displayed with per-title
attribution and a link to anilist.co, nothing is mirrored, and no bulk
collection of any kind takes place. We have read your Terms of Use carefully
and, precisely because two of its clauses could be read to touch our use
case, we would rather ask than assume.

Our application currently keeps **all** user data in the user's own browser
(IndexedDB). We are designing an **optional, per-user, opt-in convenience
synchronization** feature — a private replica of the user's own library on a
free-tier backend so that the same user can see their library on a second
device. Nothing would be public, shared, or redistributed; the feature is a
personal convenience, not a hosted service for third parties.

Before building it, we would very much appreciate written clarification on
four points:

1. **Per-user reference storage.** Does per-user cloud storage of
   "pointer-plus-user-content" records — a record consisting of an AniList
   media id plus the user's own ratings, notes and watch status, with **no**
   media metadata, titles, or artwork stored on our side — fall within the
   prohibition on using the AniList API "as a backup or data storage
   service"?

2. **Competing-service clause.** Does the clause prohibiting use "within
   competing, non-complementary services of the same nature" (including
   anime and manga list or tracker services) apply to a personal,
   non-commercial, local-first *taste atlas* whose synchronization is an
   optional per-user convenience? ECHO is not a list or tracker service and
   does not compete with AniList's social/listing product — we use AniList
   as a catalogue source and attribute every record — but the clause's
   extension to "all data provided through the API" makes us want a direct
   answer rather than our own interpretation.

3. **User-initiated local export files.** Are user-initiated **local export
   files** containing cached display fields (titles, years — never artwork)
   acceptable under the terms? Concretely: the user clicks "export my
   library", the app writes a JSON file to the user's own device from the
   user's own browser storage, and our servers are never involved. We
   consider this the user's own portability artifact, but we would like your
   position in writing.

4. **Client-side cache duration.** What cache-duration expectations apply to
   client-side metadata? We currently treat AniList records as interactive-
   use references with per-title attribution, refreshing on demand when the
   user opens a title's details, and we do not persist catalogue data beyond
   the user's own library records.

Until we have your answer, we have adopted the most conservative posture
available to us: AniList-derived records are **excluded from every cloud
payload** — they remain local to the device that added them, with no
synchronization at all, and the app says so plainly to the user. If your
answers permit more, we can relax that posture with a configuration change;
if they do not, the current posture already complies.

Thank you very much for your time and for maintaining such a wonderful API
and community. We are happy to provide any additional detail about the
application that would help.

With appreciation,

[Owner name]
ECHO developer
[Contact email]

---

## Owner checklist before sending

- [ ] Fill in the owner name and contact email.
- [ ] Review the application description for accuracy (it mirrors Revision
      1.3 §7.3.3's framing).
- [ ] Confirm the sending channel (email to contact@anilist.co; keep the
      sent copy and any reply in this folder for the D-20 evidence file).
- [ ] If no answer within a reasonable window (e.g. 30 days), the `none`
      posture stays and R-02's documentation is updated — an adverse or
      silent outcome changes nothing (Revision 1.3 §7.3.3).

## The four questions, one-line form (for tracking)

| # | Question | Plan reference |
|---|---|---|
| 1 | Pointer-plus-user-content per-user storage vs. the backup/storage prohibition | §7.3.3 Q1 |
| 2 | Competing-service clause vs. a personal non-commercial local-first taste atlas | §7.3.3 Q2 |
| 3 | User-initiated local export files with cached display fields (load-bearing for §7.3.2) | §7.3.3 Q3 |
| 4 | Client-side metadata cache-duration expectations | §7.3.3 Q4 |
