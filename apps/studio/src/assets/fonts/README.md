# Studio font assets

These WOFF2 files are self-hosted for privacy and offline use under the SIL Open Font License 1.1. Figtree and Nothing You Could Do were reviewed and pinned on 22 August 2026, and Cormorant Garamond on 29 September 2026, from the versioned Google Fonts static asset URLs returned by the Google Fonts CSS API.

| Family | Upstream asset version | Included declarations | Local subsets |
|---|---:|---|---|
| Cormorant Garamond | v21 | 400, 500 normal, 400 italic | Latin, Latin Extended |
| Figtree | v9 | 400, 500, 600 normal | Latin, Latin Extended |
| Nothing You Could Do | v21 | 400 normal | Latin |

The upstream WOFF2 binaries are variable fonts, so declarations for approved weights share a reviewed binary rather than shipping duplicate files. `typography.css` exposes only the styles and weights approved in ADR-009. Nothing You Could Do ships a single Latin subset upstream; characters outside the bundled subsets use the documented system fallbacks.

## Sources

- Cormorant Garamond CSS: `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400..500;1,400&display=swap`
- Figtree CSS: `https://fonts.googleapis.com/css2?family=Figtree:wght@400..600&display=swap`
- Nothing You Could Do CSS: `https://fonts.googleapis.com/css2?family=Nothing+You+Could+Do&display=swap`
- Licenses: the corresponding `ofl/cormorantgaramond`, `ofl/figtree`, and `ofl/nothingyoucoulddo` directories at `google/fonts`.

The exact versioned `fonts.gstatic.com` URLs can be recovered from the CSS endpoints and the pinned `v21` (Cormorant Garamond), `v9` and `v21` (Nothing You Could Do) asset identifiers. The SHA-256 manifest below is the final integrity authority if an upstream endpoint later changes.

The app makes no request to these sources at runtime.

## SHA-256

```text
96ec6109d044a8f2b279937499923fc0435db3e6bd91ce4cb1fd806d566378b9  cormorant-garamond-italic-latin-ext.woff2
e48e58027030df56869b795ca6f19b7012158275f7ad7cde1900b4a0b68d02e2  cormorant-garamond-italic-latin.woff2
cfa9a397d86f66c5c51775a2500a712d5f632a04f0c5eca6930dfaf612d4566d  cormorant-garamond-normal-latin-ext.woff2
d80df8ff5aecd299a61549f9e29ab1ed0b9b05f4ea71d50fe978e07d5240b235  cormorant-garamond-normal-latin.woff2
f153aa07c1b16fbb12391c2512860c97819a0a9fd014f338b2b3f12496479d13  figtree-latin-ext.woff2
8330490a01c60c196eae00b823de8102275aaa5862e7b76a7af21b8745338928  figtree-latin.woff2
cd209e12babc395ffcf71df1683b3afe7ad23527aea618f7ff6366c69228499f  nothing-you-could-do-latin.woff2
```
