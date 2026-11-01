# Content strategy: a curated, ready-to-use masteran library

*Decision (Nov 2026): owners do **not** upload their own music. Kicau Coach ships a curated catalogue of real bird recordings, organised into **packs per bird species**. A new owner adds a bird, taps one pack, and masteran plus isian checks work immediately.*

## Why curated beats user uploads

| | User uploads (v0.1) | Curated catalogue (v0.2) |
|---|---|---|
| Time to first session | Find MP3s, import them, mark isian by hand: about 10+ minutes, and many testers would stall | **2 taps** (add bird → pick pack) |
| Isian check | Only works if the owner marks phrases | **Works out of the box**, because isian are pre-marked by the pipeline |
| Quality | Random YouTube rips: compressed, clipped, music in the background | Same standard for every track: QC'd, high-passed, loudness-normalised, song-dense windows |
| Legal | Owners pass around copyrighted compilations | Every track is licence-cleared and credited |
| Data | Tracks differ per user, so progress can't be compared | **Same tracks for everyone**, so isian learning curves can be compared across birds (a future moat) |

## Sources and licence policy

| Source | Status | Notes |
|---|---|---|
| **xeno-canto** (API v3) | Primary. **Needs a free API key** (`XC_API_KEY`). | Thousands of SE-Asian recordings, with quality grades A–E and per-recording CC licences. Many are BY-NC-SA. |
| **Wikimedia Commons** | Secondary, live today | Sparse for SE-Asian species (0–3 files for most), but licences are clean. Some files mirror xeno-canto. |
| **Own recordings** (roadmap) | Partner programme | Record champion birds and wild tutors with breeders and clubs under a written licence. This is the long-term moat and the only path to full coverage of contest-grade isian. |

`scripts/license.ts` enforces the licence policy, and unit tests cover it:

* **commercial** (default): CC0, CC BY and CC BY-SA only. This is safe for a paid product. BY-SA tracks are redistributed under BY-SA, with credits shown in the app.
* **beta**: also CC BY-NC and BY-NC-SA. This is acceptable **only while the app is free**. Switch the policy and rebuild before any paid launch.
* **Never ND.** We trim and normalise the audio, which makes it a derivative work.

## Pipeline (`npm run catalog`)

`scripts/build-catalog.ts` runs these steps for each species in `content/species.json`:

1. **Find candidates.** Query xeno-canto and Commons for the species, and filter by licence and by `content/curation.json` exclusions.
2. **Rank them.** Score by quality grade, background species (fewer is better), preferred region (local dialects, e.g. murai *medan/aceh*), sound type and length.
3. **Process them.** Download, find the most song-dense 90 s window, high-pass at 400 Hz, loudness-normalise (−20 LUFS), add fades, and encode 64 kbps mono MP3 (about 0.7 MB per track).
4. **Run automatic QC** with the app's own analyser. A track needs SNR ≥ 18 dB, singing ≥ 12% of the time, and ≥ 5 phrases; otherwise the next candidate is tried.
5. **Pre-mark isian.** Cluster the phrases and mark the 2 most frequent phrase types that repeat at least twice.
6. **Write outputs:** `public/catalog/catalog.json`, plus packs (from `content/packs.json`) and `ATTRIBUTION.md`.

**Human curation is required before a public launch.** Automatic QC catches noise and sparse recordings. It can't judge whether a phrase is a *contest-desirable* isian. Every track carries `review: auto | approved`. An expert listener (a contest judge or senior trainer) reviews each track in `content/curation.json`:
* `approved`: the track is approved (it shows a ★ in the app).
* `exclude`: the recording is rejected; rerun the build to pick the next candidate.
* `pin`: force a specific recording for a species.
* `isianNames`: give the auto-marked phrases their community names (e.g. "Cililin – cerecet").

## Packs (content/packs.json)

| Pack | For | Species (★ = master) |
|---|---|---|
| Murai batu – Isian dasar (core isian) | Murai batu | ★murai batu, cililin, cucak jenggot, ciblek, tledekan, gereja tarung, tengkek buto |
| Murai/Kacer – Variasi tambahan (extra variety) | Murai, kacer | belibis, cendet, kenari, kapas tembak, trucukan |
| Kacer – Isian dasar | Kacer | ★kacer, ciblek, cililin, cendet, gereja |
| Cucak ijo – Isian dasar | Cucak ijo | ★cucak ijo, ciblek, cililin, kenari, cendet, tledekan |
| Kenari – Lagu & isian (song & isian) | Kenari | ★kenari, ciblek, prenjak |
| Lovebird – Ngekek (chatter) | Lovebird | ★lovebird, kenari |
| Pleci – Isian dasar | Pleci | ★pleci, ciblek, kenari |
| Chào mào – Lagu master (master song) | Red-whiskered bulbul (VN) | ★chào mào |
| Umum – Isian populer (popular isian) | Other species | ciblek, kenari, cililin, gereja |

A pack ships with whatever species have cleared tracks, and the app shows "N more coming soon". Packs with no cleared track show "Segera hadir" (coming soon).

## Coverage today, and how to close the gap

See the build report in `public/catalog/catalog.json` (`packs[].missingSpecies`). With Commons only, coverage is thin. The core contest isian (cililin, cucak jenggot, ciblek, tledekan) are **not on Commons at all**. To close the gap:

1. **This week:** create a xeno-canto account, put the API key in the environment (`XC_API_KEY`), then run `npm run catalog`. With the commercial policy, expect most species to clear. If a species is only available under NC, decide whether to run the **beta** policy during the free test phase.
2. **During the user test:** an expert listener approves or excludes tracks and names the isian (about 2 hours for 20 tracks).
3. **Before a paid launch:** run the partner recording programme for gaps and contest-grade isian (target 3 tracks per species and dialect), with revenue share or a flat fee per approved track.

## Product guardrails kept

* No user music uploads, so there's no copyright risk from shared compilations.
* The owner can still **record their bird** (or upload a recording of it) for Cek Isian. That's the bird's own voice, not training material.
* Synthetic audio stays demo-only and is never used as training material (research §5).
