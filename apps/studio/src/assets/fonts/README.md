# Studio font assets

These WOFF2 files are self-hosted for privacy and offline use under the SIL Open Font License 1.1. They were reviewed and pinned on 13 July 2026 from the versioned Google Fonts static asset URLs returned by the Google Fonts CSS API.

| Family | Upstream asset version | Included declarations | Local subsets |
|---|---:|---|---|
| Newsreader | v26 | 400 normal, 400 italic, 500 normal | Latin, Latin Extended |
| Hanken Grotesk | v12 | 400, 500, 600, 700 normal | Latin, Latin Extended |
| Caveat | v23 | 500, 600 normal | Latin, Latin Extended |

The upstream WOFF2 binaries are variable fonts, so declarations for approved weights share a reviewed binary rather than shipping duplicate files. `typography.css` exposes only the styles and weights approved in ADR-007. Characters outside the bundled subsets use the documented system fallbacks.

## Sources

- Newsreader CSS: `https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;1,400&display=swap`
- Hanken Grotesk CSS: `https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap`
- Caveat CSS: `https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&display=swap`
- Licenses: the corresponding `ofl/newsreader`, `ofl/hankengrotesk`, and `ofl/caveat` directories at `google/fonts` commit `ec0464b978de222073645d6d3366f3fdf03376d8`.

The exact versioned `fonts.gstatic.com` URLs can be recovered from the CSS endpoints and the pinned `v26`, `v12`, and `v23` asset identifiers. The SHA-256 manifest below is the final integrity authority if an upstream endpoint later changes.

The app makes no request to these sources at runtime.

## SHA-256

```text
93b3fdd6ded70837e67eb686a5ed3a896b03d0cd5f7e4be62f07a4efeaebfcfd  caveat-latin-ext.woff2
7a0049db01fdd8fc7af7ef36675862a72a5c76d0cb45ae63c9f5b6f1b769dac7  caveat-latin.woff2
a1376a563717f1efa2f5286ab23da2b61ae8dec827a77b97adfa01cad4ec4ee2  hanken-grotesk-latin-ext.woff2
1f21c6eaa0000f3329cfcfac966b43d5bebf5aa610303e33294ac31bc6f4bb59  hanken-grotesk-latin.woff2
3b8eca75ceca3077c49e46e29f9afb1c91c6e474c2b10d42bec998ce593e2a27  newsreader-italic-latin-ext.woff2
56febd06c694ba791028f22c659bc1f8c80954732a77db8d708432296268e163  newsreader-italic-latin.woff2
fe52554ab1cd7dd9704db81572f45ef0eb122679c35bbbbc728baf701033b727  newsreader-normal-latin-ext.woff2
2a69ec1c0fb79a464de0e19957cdb3a65b5f626d85fffd164f9de557d3a64878  newsreader-normal-latin.woff2
```
