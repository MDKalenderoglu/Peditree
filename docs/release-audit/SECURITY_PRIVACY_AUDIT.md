# Security and privacy audit

Scope:

- The repository at `83ad967`.
- The production build (`npm run build`).
- The Cloudflare Pages configuration in `public/_headers`.

Method:

- Threat model, then code search and bundle inspection.
- Existing hostile-input tests, plus the new acceptance tests.

References: OWASP Top 10:2025, with the OWASP ASVS 5.0 controls that apply to a static client
app, and the KVKK (Law 6698) obligations for health and genetic data. No legal compliance is
claimed (see the last section).

## What kind of application

**Client-only, static.** There is no server, no account and no database. No analytics, no
telemetry, no third-party script, font or CDN at run time: fonts are bundled.

Built-bundle check:

- The only absolute URLs in `dist/assets/index-*.js` are XML namespaces, `https://doi.org/`, the
  GitHub repository and `react.dev/errors`. They appear as links or text; none is fetched.
- The one `fetch` in the source loads the app's own bundled font files, so that a download can
  embed them.
- No source maps are published (0 `sourceMappingURL`).
- The dev-only mark-audit hook is stripped from the build.

## Where patient data go

| Data | Where | How long | Who can read it |
|---|---|---|---|
| The open pedigree (names, ages, findings, notes, birth date) | `sessionStorage` key `clinical_pedigree_app.session.v2` | Until the tab closes (survives a reload) | Anyone using the same unlocked browser profile while the tab is open; browser extensions with page access |
| An unreadable earlier session | `sessionStorage` key `…session.v2.unreadable` | Until the tab closes | Same |
| Undo history | Memory only | Until the tab closes | Same |
| Project file `.peditree.json`, PNG/SVG/PDF, PED | The user's Downloads, only when the user asks | Until the user deletes them | Whoever has the device or the files |
| Shared image | The OS share sheet, only when the user picks a target; optional without the patient's name | Depends on the target app | The chosen recipient |
| Preferences (look, ring menu, language) | `localStorage` | Persistent | No patient data |
| Older versions' data in `localStorage` | Moved into the session once, then **removed** from `localStorage` (`persistenceV2.adoptLegacy`) | — | — |

Nothing is sent over the network. `connect-src 'self'` and `form-action 'none'` in the CSP would
block it if a future change tried.

## Threats and controls

| Threat (OWASP 2025) | Control in PediTree | Evidence | Status |
|---|---|---|---|
| XSS via names, notes, findings (A05 Injection) | React escapes text; D3 uses `.text()`; no `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `new Function` in `src/` (searched). A project-wide no-`innerHTML` test exists | `screen.test.js` "a name that looks like HTML stays text"; source search | Pass |
| Malicious project / PED file (A08 Integrity) | Size limits (20 MB), shape checks, validation before use, `__proto__` keys inert, invalid files refused with a message, never half-loaded | `hostileFiles.test.js`, `codexAudit.test.js`, `persistence*.test.js` | Pass |
| SVG export content | Serialised from the app's own DOM; text escaped by XMLSerializer; selection and click areas removed | `exportUtils.test.js`, `acceptance` Turkish-letters test | Pass |
| Clickjacking, framing | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | `public/_headers` | Configured, **not verified live** |
| Script injection via CDN / supply chain at run time (A03) | No run-time third-party code; `script-src 'self'` | Bundle inspection | Pass |
| Vulnerable dependencies (A03) | Shipped dependencies: `npm audit --omit=dev` = 0. Dev tooling: 6 moderate (minimatch via eslint), not shipped | `npm audit` | P3, open (A-06) |
| Security misconfiguration (A02) | CSP, `Referrer-Policy: no-referrer`, `nosniff`, `Permissions-Policy`, `COOP`, `noindex`; `index.html` has no inline script (CSP-compatible) | `public/_headers`, `dist/index.html` | Configured, **not verified live** |
| Sensitive data in logs (A09) | `console.warn` messages say what failed (storage, file), never patient content. The one `console.error` (graph integrity failed) can include a person's label in an issue message; it stays in the user's own browser console and is sent nowhere | Code search | Pass (local only) |
| Error-message disclosure | Messages are plain sentences, no stack traces on screen | Screen tests | Pass |
| AuthN / AuthZ / sessions (A01, A07) | Not applicable: no accounts, no server | — | N/A |
| Unsafe URL handling | External links are fixed constants (GitHub, mailto); `rel="noreferrer"` | `App.jsx` | Pass |
| Production debug switch | `globalThis.__PEDITREE_PACKER__` picks a fallback layout engine; it affects only the user's own tab | Bundle | P3 (A-12) |

## Shared-device and confidentiality risks (A-03)

`sessionStorage` is neither encrypted nor access-controlled. On a shared clinic computer, while
the tab is open, another person at the same profile can see the pedigree. That is also true on
screen. Mitigations already present:

- Session-only autosave.
- A warning before leaving with work that was not downloaded.
- "Share without the patient's name".
- The About text says nothing is sent to any server.

**PediTree cannot by itself protect identifiable data at rest on a device.** Downloaded files are
ordinary files. Institutional controls are needed: a screen lock, personal OS accounts, encrypted
disks, and where downloaded pedigree files are kept.

The privacy notice (About) matches the actual behaviour as audited. Recommended extra sentences:

- "Close the tab when you leave a shared computer."
- "Downloaded files contain patient information; store them as your institution requires."

## KVKK: technical findings, not a legal opinion

- **Data minimisation:** the app asks for nothing beyond what the clinician types. The PED export
  leaves out names; sharing can leave out the name; Box 1 of B2022 also asks to "limit
  identifying information".
- **No processor or transfer:** no data reach the developer or any third party. The clinic stays
  the sole data controller, and no cross-border transfer happens through the app.
- **Retention:** the app keeps nothing after the tab closes. Retention of downloaded files is the
  institution's responsibility.

**Not verified, needs legal or organisational review:**

- Whether the hospital's KVKK policy allows browser-based tools on clinic devices.
- Whether patients must be informed (aydınlatma metni) when a pedigree is drawn with this tool.
- Rules for e-mailing or messaging pedigree images (the share sheet), which may count as a
  transfer.
- Whether "noindex" alone is enough for a public URL. It holds no data, but the URL itself
  carries no access control.

## Before a public release

1. Deploy to a preview URL and check the response headers (CSP above all) in browser dev tools,
   on Chrome and on Safari.
2. Add the two shared-device sentences above to About and README.
3. Have the institution's KVKK officer review the "where data go" table.
