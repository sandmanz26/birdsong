# AGENTS.md — start here (for AI assistants and new engineers)

This file is the single entry point for any AI agent working on this repository. Read it fully before changing anything. Deeper material lives in `docs/` (index at the bottom).

---

## 1. What this product is

**Kicau Coach** is an offline-first PWA for Indonesian (and SE-Asian) song-bird keepers (*kicau mania*). It has two features:

1. **Masteran Terjadwal** (scheduled song tutoring). The owner picks a **curated pack** of real bird recordings for their bird's species. The app plays it in morning/night sessions that sound like a live tutor, not a tape loop: shuffled order, natural gaps, slight level variation, fades. It enforces welfare guardrails (daily cap, "don't change material within 2 weeks", low volume while moulting).
2. **Cek Isian** (isian check). The owner records their bird for 30–120 s. On-device analysis reports, for each target phrase (*isian*), whether it is **Masuk** (learned, score ≥ 70), **Mulai mirip** (getting close, ≥ 50) or **Belum** (not yet). It also reports contest-style metrics and a recording-quality warning.

- **Live:** https://birdsong-six.vercel.app (auto-deployed from `main` by Vercel)
- **Repo:** `sandmanz26/birdsong`
- **UI language:** Bahasa Indonesia (default) + English toggle

## 2. Non-negotiable product rules (decided by the owner — do not reverse)

1. **No user music uploads.** Masteran audio comes only from the curated catalogue. Owners may still record or upload *their own bird* for Cek Isian.
2. **No dummy, sample or synthetic media in the product.** Synthetic audio exists only in `tests/fixtures/synth.ts` for unit tests. Never import it from `src/`.
3. **Only curated, standard-compliant audio is published.** Every published clip must pass the content standard (`scripts/standard.ts`) **and** carry a named human approval in `content/curation.json`. Automation alone never publishes.
4. **Licences:** only CC0 / CC BY / CC BY-SA, or a documented written permission for a non-commercial recording. Never ND. Never ripped YouTube or other copyrighted audio (the owner asked; the answer was no, for copyright and YouTube-ToS reasons; see §9).
5. **No AI-generated birdsong as training material.** Birds copy artifacts (research: `docs/01-research.md` §5).
6. **Ethics:** promote captive-bred, ringed birds. Show legal and conservation notices. No trading features.

## 3. Current state (Nov 2026, v0.4 + catalogue v1)

| Item | State |
|---|---|
| App | Feature-complete MVP, deployed |
| Species registry | 36 species (25 trainable targets, 21 isian sources), GBIF-verified names |
| Candidates | 291 processed clips in `review/candidates/` (audio git-ignored; regenerate with the pipeline) |
| **Published catalogue** | **104 clips, 17 packs, 22 species** in `public/catalog/` |
| Curation status | ⚠ Approved **in bulk by the product owner as interim curator** ("Pemilik produk – Kurator sementara (belum diverifikasi juri)"). Isian names are generic ("Murai batu – frasa 1"). **Needs re-review by a contest judge.** Many clips are from outside Indonesia (dialect mismatch). |
| Tests | 52 unit tests (`npm test`), all passing |

## 4. Commands

```bash
npm install
npm run dev                 # app at http://localhost:5173
npm test                    # vitest unit tests
npm run build               # typecheck (app + scripts) + vite build → dist/
npm run typecheck

# Content pipeline (Node via vite-node, needs ffmpeg/ffprobe)
npm run catalog:candidates                      # all species, sequential (~90 min)
npm run catalog:candidates -- --only murai_batu,ciblek
npm run catalog:candidates -- --shard 0/4       # run 0..3 in parallel, then:
npm run catalog:candidates -- --merge
XC_API_KEY=... npm run catalog:candidates       # adds xeno-canto (best source for Indonesia)
npm run review                                  # dev-only curator tool → export content/curation.json
npm run catalog:publish                         # ONLY gate into public/catalog/
npm run catalog:publish -- --curation <file> --out <dir> --packs <file> --cohort
npm run calibrate -- --max-clip-sec 30          # matcher research (~20 min)
```

## 5. Architecture

```
content/            ← SOURCE OF TRUTH for content (edit these, not generated files)
  species.json        species registry (id, sci, names, aliases, roles, recommendedIsian, legal, conservation)
  packs.json          extra cross-species packs (per-species basic packs are auto-generated)
  curation.json       human decisions: approvals, exclude list, written permissions
scripts/            ← Node-only content pipeline (never bundled into the app)
  sources.ts          iNaturalist / xeno-canto / Commons adapters (pure parsers + fetch)
  license.ts          licence classifier (commercial policy)
  taxonomy.ts         GBIF Backbone check (cached in .cache/catalog/gbif.json)
  standard.ts         CONTENT STANDARD v2: auto checks + publishBlockers()
  build-candidates.ts step 1: fetch → filter → dedupe → process → measure → review/candidates/
  publish-catalog.ts  step 3: validate approvals → transcode 64 kbps → public/catalog/ + packs
  calibrate.ts        matcher accuracy research
review/candidates/  ← generated review material (candidates.json, COVERAGE.md, PERMISSIONS.md, REPORT.md, CALIBRATION.json)
public/catalog/     ← GENERATED published catalogue (catalog.json, audio/, ATTRIBUTION.md). Never hand-edit.
src/                ← the app (React 18 + TypeScript + Vite, no backend)
  App.tsx, nav.ts     state router (history.pushState); routes in nav.ts
  screens/            Birds, BirdForm, BirdDetail(tabs: Masteran/Cek Isian/Progres), PackPicker,
                      Player (session + stand-by), Library (catalogue), TrackEditor, More
  catalog/            client.ts (load catalogue, install pack → IndexedDB), types.ts (catalogue schema)
  audio/              planner.ts (pure session planner), engine.ts (Web Audio playback + WakeLock),
                      recorder.ts (raw mic), decode.ts, random.ts
  dsp/                fft, spectrogram (40-band log-mel 0.8–10 kHz @22.05 kHz), segment, dtw,
                      analyze.ts (isian matching, quality gate), fingerprint.ts (dedupe), worker.ts + client.ts
  species.ts          registry access for the app (imports content/species.json)
  db.ts               IndexedDB (birds, tracks, isian, programs, sessions, checks, events, blobs)
  i18n.ts             all UI strings, id + en (TS enforces both have the same keys)
  review/             curator review tool (served only by `npm run review`; not in production build)
tests/              ← vitest; tests/fixtures/synth.ts = synthetic chirps (TEST ONLY)
vercel.json         ← Vite build, no-cache for sw.js + catalog.json, microphone permission
```

### Content flow
```
species.json ─► build-candidates ─► review/candidates (+COVERAGE, PERMISSIONS)
                                         │
                       npm run review (human signs H1–H6, names isian)
                                         ▼
                                 content/curation.json
                                         │
                       publish-catalog (re-validates everything)
                                         ▼
                public/catalog/catalog.json + audio ─► app (install pack → IndexedDB, offline)
```

### Isian matching (src/dsp/analyze.ts)
Resample 22.05 kHz → STFT 512/hop 256 → 40 mel bands 0.8–10 kHz → per-band noise floor (20th percentile) → "excess over floor" features → syllables (adaptive threshold + hysteresis) → phrases (gap < 120 ms) → **subsequence DTW** of each template against each phrase (cosine distance, ±1 band pitch tolerance, tempo 0.75–1.35×) → `SCORE_CONFIG` maps cost to 0–100. Templates are precomputed at pack install and stored on the `Isian` record.

Calibrated on 145 real isian / 10,354 impostor pairs: "Masuk" ≈ 2% false matches, "Mulai mirip" ≈ 6%. Z-norm (cohort normalisation) was **tested and rejected** (worse AUC); it is kept opt-in (`SCORE_CONFIG.mode`). See `docs/05`.

## 6. Content standard v2 (summary; full text in `docs/06`)

| Auto, hard (cannot be overridden) | L1 licence · T1 taxonomy (GBIF) · L2 TASL attribution · A1 clip ≥ 8 s · A2 −23…−18.5 LUFS & TP ≤ −1 dBTP · A3 SNR ≥ 25 dB · A4 singing ≥ 20% · A5 clipping ≤ 0.01% · A6 source ≥ 32 kHz |
|---|---|
| Auto, expert can cover | M1 archive grade A (→H3) · M2 no background species (→H2) · M3 preferred region (→H5) · M4 community ID (→H1) |
| Human, all required | H1 species · H2 single species · H3 no noise · H4 masteran-worthy · H5 dialect ok · H6 isian named |
| Publish | P1 ≥ 45 s approved per species · max 6 clips / 240 s per species · packs need own master song + ≥ 1 isian species |

If you change thresholds, update `scripts/standard.ts`, `tests/standard.test.ts` and `docs/06` together, with a written reason.

## 7. How to do common tasks

- **Add a species:** add an entry to `content/species.json` (verify `sci` with GBIF; add `aliases`, `roles`, `country`, `recommendedIsian`, and `legal` with a source URL if known). Run `catalog:candidates -- --only <id>`, then review and publish. No code change is needed.
- **Approve or reject clips:** `npm run review` (choose curator name + role), export, replace `content/curation.json`, then `catalog:publish`. Commit `content/curation.json` + `public/catalog/`.
- **Record a written permission (NC recording):** add `content/curation.json → permissions["inat:12345"] = { grantedBy, date, scope, evidence }`, then rerun candidates for that species.
- **Add a UI string:** add the key to **both** `id` and `en` in `src/i18n.ts`.
- **Deploy:** merge into `main` (squash). Vercel deploys automatically in about 30 s.

## 8. Engineering conventions & gotchas

- `scripts/*.ts` use Node APIs and are type-checked by `tsconfig.scripts.json`. Never import them into `src/`, except the pure `scripts/standard.ts` / `candidate-types.ts`, which only the review tool uses.
- Scripts that tests import guard `main()` with `if (!process.env.VITEST)`. Under vite-node, `process.argv[1]` is the vite-node binary, so don't use argv checks.
- ffmpeg `loudnorm linear=true` silently falls back to dynamic mode on short or peaky clips. The pipeline therefore does explicit gain staging (`measureLoudnessArgs` + `volume` + `alimiter`, max 4 dB limiting).
- Duplicate detection needs time alignment (`envelopeAlignment`). The spectral fingerprint alone was too coarse (a real duplicate scored 0.985 vs 0.979 for a non-duplicate).
- Global CSS styles inputs; checkbox, range and radio are excluded on purpose.
- Charts: never more than 8 series colours. The progress chart groups by isian source species.
- iNaturalist: ≤ 1 API request/s; the licence is per **sound**, not per observation.
- Git: the auto-mode classifier blocks force-push. Use a new branch + PR + squash-merge instead.
- `.cache/` (raw downloads) and `review/candidates/audio/` are git-ignored. Never commit them.
- Commit messages end with the attribution lines required by the session; never put model names in commits.

## 9. Decision log (why things are the way they are)

| # | Decision | Reason |
|---|---|---|
| D1 | PWA, no backend, IndexedDB | Fast to test; privacy; offline at the cage |
| D2 | Real recordings, generate the *program*, not the audio | Neural birdsong has artifacts; birds copy them |
| D3 | Curated catalogue instead of uploads (owner request) | Ready to use; legal; comparable progress data |
| D4 | Content standard + expert gate; removed all demo data (owner request) | "Media must be curated and follow a real standard" |
| D5 | iNaturalist as keyless primary source; NC → permission list | xeno-canto needs a key; licence is the real bottleneck |
| D6 | Standard v2 (8 s clips + 45 s/species, LUFS band) | Fitted to real archive data, with reasons in docs/06 |
| D7 | Keep raw DTW scoring, reject Z-norm | Measured worse on 10k pairs |
| D8 | Owner bulk-approved 113 clips as interim curator | Owner request so audio is playable now; flagged for judge re-review |
| D9 | No YouTube ripping | Copyright (UU 28/2014) + YouTube ToS. Instead: partner with channels under written permission |

## 10. Open work (prioritised)

1. **Judge re-review** of the published catalogue: replace generic isian names with community names, reject non-Indonesian dialects for contest species (e.g. murai).
2. **xeno-canto API key** → rerun candidates (biggest source of Indonesian recordings: cililin, cucak jenggot, tledekan, murai Sumatra).
3. **Permission requests** to recordists in `review/candidates/PERMISSIONS.md` (264 rows).
4. **Partner programme** (YouTube channels, breeders, clubs): permission letter template + upload intake → pipeline.
5. **User test** (`docs/03`), especially part C: expert-labelled pupil recordings to recalibrate thresholds.
6. Native Android wrapper for screen-off scheduling; "answer-back" contingent tutoring mode.

## 11. Glossary (Indonesian hobby terms)

| Term | Meaning |
|---|---|
| kicau mania | song-bird keeping hobby/community |
| masteran | tutoring a bird with another bird's song (live or recorded) |
| isian | a phrase a bird has copied from another species ("filling") |
| masuk / mulai mirip / belum | learned / getting close / not yet |
| gacor | singing actively and continuously |
| kerja | working / singing activity (contest criterion) |
| variasi | song variety |
| trotolan | juvenile; **muda** young; **dewasa** adult; **mabung** moulting |
| tangkaran | captive-bred (ideally ringed); **tangkapan** wild-caught |
| lomba / juri | contest / judge (e.g. PBI = Pelestari Burung Indonesia) |
| paket | pack (curated masteran set in this app) |

## 12. Docs index

| File | Contents |
|---|---|
| `docs/01-research.md` | Market, users, masteran practice, science, build-vs-generate |
| `docs/02-prd.md` | Product requirements (status v0.4) |
| `docs/03-user-testing-plan.md` | Test design, metrics, decision rules |
| `docs/04-content-strategy.md` | Why curated, sources, licence policy, packs |
| `docs/05-matcher-calibration.md` | Matcher accuracy research (v0.2 + v0.4 at scale) |
| `docs/06-curation-standard.md` | Content standard v2 + audit + changelog |
| `docs/07-species-coverage.md` | Species research, legal status, capacity table, functional fixes |
| `review/candidates/COVERAGE.md` | Generated per-species capacity |
| `review/candidates/PERMISSIONS.md` | Generated permission-request list |
