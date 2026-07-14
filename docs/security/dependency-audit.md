# Dependency audit triage

**Last reviewed:** 2026-07-14  
**Release target:** macOS (`dmg`, `app`)

This file records advisories that appear in a cross-platform lockfile scan but are not reachable in the shipped macOS application. An ignore is not a permanent dismissal: it must be rechecked whenever the release target or dependency path changes.

## JavaScript production dependencies

`pnpm audit --prod --audit-level high --registry=https://registry.npmjs.org` reported no known vulnerabilities on 2026-07-14.

## Rust dependencies

The unfiltered `cargo audit` scan reports two high-severity advisories against `quick-xml 0.39.4`:

| Advisory | Finding | Triage |
| --- | --- | --- |
| `RUSTSEC-2026-0194` | Quadratic duplicate-attribute checking | Not present in the macOS target. The only dependency path is `rfd` → Linux-only `ashpd` → `wayland-scanner` → `quick-xml`. `wayland-scanner` is a build-time procedural macro that parses trusted Wayland protocol XML, not Studio content. |
| `RUSTSEC-2026-0195` | Unbounded namespace allocation in `NsReader` | Same Linux-only build-time path. `wayland-scanner 0.31.10` uses `quick_xml::Reader`, not the affected `NsReader`, and never parses imported Markdown, attachments, backups, or IPC input. |

The current upstream `wayland-scanner 0.31.10` requires `quick-xml ^0.39`, while the advisory fix requires `>=0.41`; the lockfile cannot select the fixed version without an upstream dependency update. The release audit therefore uses:

```sh
cargo audit \
  --ignore RUSTSEC-2026-0194 \
  --ignore RUSTSEC-2026-0195
```

This is an accepted macOS-release exception, not an acceptance for a Linux release. Before enabling Linux packaging:

1. update Tauri/rfd/Wayland dependencies until the fixed XML parser is selected;
2. remove both ignores and run an all-target audit;
3. separately resolve or assess the GTK3 unmaintained warnings and `glib` iterator unsoundness reported through Tauri's Linux-only WebKit stack.

The remaining RustSec warnings in the current cross-platform lockfile are unmaintained GTK3/UNIC crates and `glib` unsoundness reached only through Linux target dependencies. None is compiled into the macOS artifact. They remain upgrade pressure and must not be silently inherited by a future Linux build.
