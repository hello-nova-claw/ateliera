# Studio font assets

These WOFF2 files are self-hosted for privacy and offline use under the SIL Open Font License 1.1. They were reviewed and pinned on 22 August 2026 from the versioned Google Fonts static asset URLs returned by the Google Fonts CSS API.

| Family | Upstream asset version | Included declarations | Local subsets |
|---|---:|---|---|
| Source Serif 4 | v14 | 300 normal, 400 normal, 300 italic, 400 italic | Latin, Latin Extended |
| Figtree | v9 | 400, 500, 600 normal | Latin, Latin Extended |
| Nothing You Could Do | v21 | 400 normal | Latin |

The upstream WOFF2 binaries are variable fonts, so declarations for approved weights share a reviewed binary rather than shipping duplicate files. `typography.css` exposes only the styles and weights approved in ADR-009. Nothing You Could Do ships a single Latin subset upstream; characters outside the bundled subsets use the documented system fallbacks.

## Sources

- Source Serif 4 CSS: `https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..400;1,8..60,300..400&display=swap`
- Figtree CSS: `https://fonts.googleapis.com/css2?family=Figtree:wght@400..600&display=swap`
- Nothing You Could Do CSS: `https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap`
- Licenses: the corresponding `ofl/sourceserif4`, `ofl/figtree`, and `ofl/nothingyoucoulddo` directories at `google/fonts`.

The exact versioned `fonts.gstatic.com` URLs can be recovered from the CSS endpoints and the pinned `v14`, `v9`, and `v21` asset identifiers. The SHA-256 manifest below is the final integrity authority if an upstream endpoint later changes.

The app makes no request to these sources at runtime.

## SHA-256

```text
f153aa07c1b16fbb12391c2512860c97819a0a9fd014f338b2b3f12496479d13  figtree-latin-ext.woff2
8330490a01c60c196eae00b823de8102275aaa5862e7b76a7af21b8745338928  figtree-latin.woff2
cd209e12babc395ffcf71df1683b3afe7ad23527aea618f7ff6366c69228499f  nothing-you-could-do-latin.woff2
513549ab98be3ff8f5dfbc43e9782562bb059ec966c9259c1aeab99193e39426  source-serif-4-italic-latin-ext.woff2
011e0ca2bd14c5dff94aa4c61121b8d057b95dbdbb2af621b175fed1059cfd5e  source-serif-4-italic-latin.woff2
a0cd390d017200f91327781204458ff918999584bece8902497ba6c08472178d  source-serif-4-normal-latin-ext.woff2
2a24bad466f09b88b8e9cbc488bf774117c912e66374c57bf4716855849143f8  source-serif-4-normal-latin.woff2
```
