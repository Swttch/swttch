# @ file mentions rank with fuzzy subsequence matching (IntelliJ-style)

> Languages: **English** · [한국어](./ko.md)
>
> Related: [#170](https://github.com/Swttch/swttch/issues/170), [#224](https://github.com/Swttch/swttch/pull/224)

## What's new

The `@` file-mention picker now ranks results with **fuzzy subsequence
matching**, the same style as IntelliJ's Search Everywhere / CamelHump. Before,
it only matched a file when your query appeared as a **contiguous substring** of
the path, so an abbreviation like `bcva` found nothing.

Now `@bcva` finds `docs/business-case-validation-architecture.md` — one letter
per **word boundary** (**b**usiness-**c**ase-**v**alidation-**a**rchitecture) —
and the matched characters are highlighted in the dropdown so you can see why an
entry matched.

## What you see

- **Abbreviations work.** `@jbadapter` matches `JetBrainsAdapter.ts`, `@brad`
  matches `BrowserAdapter.ts`, and so on — the query characters only need to
  appear in order, not adjacently.
- **Matched characters are highlighted** in the result row (bold, accent color),
  IntelliJ Search-Everywhere style, so the match is obvious at a glance.
- **The best match ranks first.** Matches on word boundaries (camelCase humps,
  and `/`, `-`, `_`, `.`, space separators) and on a file's own name rank above
  scattered or directory-only matches.

## How it works

The backend replaces the old substring filter with a **subsequence scorer**
(`rankFiles` in `listProjectFiles.ts`):

- A candidate matches only when every query character appears **in order** in
  the target; otherwise it is dropped.
- Each matched character earns bonuses for starting the match, landing on a
  **word boundary** (an uppercase letter for camelCase, or a character right
  after `/ _ - . ` space`), and being **consecutive** with the previous match; a
  gap between matches is penalized. This is what pushes `business-case-…` above
  a file where `b`, `c`, `v`, `a` happen to be scattered.
- Each item is scored against its **basename first** (with a bonus) and its full
  relative path, so a file whose own name matches ranks above one that only
  matches through a directory prefix. Ties break toward the shorter path.

Alongside each result the backend returns `matchIndices` — the positions of the
matched characters — which the webview forwards **verbatim** (raw-data
preservation) to `MentionDropdown`, where `renderHighlightedPath` wraps exactly
those characters. An empty query still returns directories only, unchanged.
