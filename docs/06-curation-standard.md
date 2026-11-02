# Kicau Coach content standard (v2), and the curation audit

*Effective Nov 2026 (v2 from 2 Nov 2026). Owner: Product. Implemented in `scripts/standard.ts`, which has unit tests. Changes from v1 are listed at the end.*

## Principle

**The product contains no dummy, sample or synthetic media.** Every sound an owner hears is a real field recording that:
1. passes all **automatic** checks, which are measured and can't be overridden, **and**
2. has been **signed off by a named expert** (a contest judge or senior trainer) on every **human** check.

Nothing is published on automation alone. If no track qualifies, the catalogue is empty and the app says so honestly ("Katalog sedang dikurasi", the catalogue is being curated). Synthetic audio exists only as a unit-test fixture under `tests/fixtures/` and can't be bundled into the app.

There is no single official "masteran standard" in the hobby. Contest standards are set per organiser (e.g. PBI) and judged by ear. This standard therefore combines published technical, legal and archival standards with mandatory expert judgement for the hobby-specific parts.

## The checks

| ID | Check | Type | Threshold | Basis |
|---|---|---|---|---|
| L1 | Licence allows commercial use and derivatives | auto, hard | CC0 / CC BY / CC BY-SA, **or documented written permission** for an NC recording (never ND) | Creative Commons licence terms |
| T1 | Scientific name accepted and source taxon matches | auto, hard | GBIF Backbone EXACT + ACCEPTED (or a documented synonym); source taxon = species or its subspecies | [GBIF Backbone](https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c) |
| L2 | Complete attribution | auto, hard | Title, Author, Source, Licence present | [CC best practice "TASL"](https://wiki.creativecommons.org/Best_practices_for_attribution) |
| A1 | Complete song bout per clip | auto, hard | ≥ 8 s per clip | One song bout; iNaturalist clips have a median of ~15 s |
| P1 | Enough material per species | publish, hard | ≥ 45 s of approved clips per species (up to 6 clips / 240 s) | Variety for a masteran session |
| A2 | Loudness | auto, hard | −23 … −18.5 LUFS integrated (target −20), true peak ≤ −1 dBTP | ITU-R BS.1770 / EBU R128 measurement |
| A3 | Clean recording | auto, hard | Bird ≥ 25 dB above background | "Jernih, tanpa noise" (clear, no noise) |
| A4 | Active bird | auto, hard | Song ≥ 20% of the time | "Gacor" (actively singing) material |
| A5 | No distortion | auto, hard | ≤ 0.01% clipped samples in the source | Learning birds copy distortion |
| A6 | Full bandwidth | auto, hard | Source sample rate ≥ 32 kHz | Song energy up to ~10 kHz |
| M1 | Archive grade "A" | auto, or expert if unknown | xeno-canto grade A; no grade → covered by H3 | [xeno-canto quality scale](https://xeno-canto.org/forum/topic/32514) |
| M2 | No background species listed | auto, or expert if unknown | 0 listed; not recorded → covered by H2 | Single focal species |
| M4 | Species ID verified by the source community | auto, or expert | iNaturalist research grade; otherwise covered by H1 | iNaturalist community ID |
| M3 | Preferred region/dialect | auto, or expert override | Country in the species' preferred list; otherwise needs H5 | Local dialects matter |
| H1 | Correct species | expert | Matches label and scientific name | Burung Indonesia checklist / AviList taxonomy |
| H2 | Only the focal species audible | expert | — | Expert ear |
| H3 | No human voice, music, vehicles, wind or handling noise | expert | — | Expert ear |
| H4 | Suitable as masteran (active, contest-worthy) | expert | — | Contest judge / senior trainer |
| H5 | Dialect/region acceptable for target birds | expert | — | Contest judge / senior trainer |
| H6 | Isian markers on complete phrases, with community names | expert | Unnamed isian are dropped; a clip may keep none (then it is masteran material only, not a Cek Isian target) | Contest judge / senior trainer |

An approval must name the curator, their role/credential and a date, and confirm H1–H6. A curator **can't** override a hard automatic failure.

**Processing is minimal and disclosed.** Each track is an excerpt of the most song-dense ≤ 90 s, with a 400 Hz high-pass, linear two-pass loudness normalisation and fades. There is no denoising and no pitch or time change, so the bird's song is never altered. This modification notice is shown with the credits.

## Workflow

```
npm run catalog:candidates   # find + process + measure  → review/candidates/  (never shipped)
npm run review               # expert listens, signs H1–H6, names isian → exports content/curation.json
npm run catalog:publish      # re-validates everything; only zero-blocker tracks → public/catalog/
```

A pack is offered only when it has ≥ 2 published tracks, including the target bird's own master song if the pack lists one.

## Audit of the current candidates (Nov 2026)

These sources are Wikimedia Commons only, because xeno-canto needs an API key. The v0.2 product shipped 7 auto-selected tracks without expert review. **They have been withdrawn.**

| Species | Recording | Recordist | Licence | Length | | Result |
|---|---|---|---|---|---|---|
| Murai batu | ShamaJavadi.ogg | L. Shyamal | CC BY-SA 3.0 | 13 s | **was shipped in v0.2** | Rejected by standard: A1 (12.6 s), A6 (8000 Hz) · expert must confirm M1, M2, M3 |
| Kacer | Copsychus saularis - Oriental Magpie-Robin XC126 | Sudipto Roy | CC BY-SA 3.0 | 90 s | **was shipped in v0.2** | Rejected by standard: A2 (-20.3 LUFS · -0.3 dBTP) · expert must confirm M1, M2, M3 |
| Kacer | Magpie robin.ogg | Shajiarikkad | CC BY-SA 3.0 | 81 s |  | Passes auto checks → awaiting expert · expert must confirm M1, M2, M3 |
| Kacer | XC126472-OriginalOrientalmagpierobinMarch222013. | Sudipto Roy | CC BY-SA 3.0 | 54 s |  | Passes auto checks → awaiting expert · expert must confirm M1, M2, M3 |
| Kenari | Serinus canaria forma domestica - audio 01 ies.o | Frank Vincentz | CC BY-SA 3.0 | 90 s | **was shipped in v0.2** | Passes auto checks → awaiting expert · expert must confirm M1, M2 |
| Kenari | De-Kanari.ogg | Jeuwre | CC BY-SA 4.0 | 2 s |  | Rejected by standard: A1 (2.0 s) · expert must confirm M1, M2 |
| Kenari | De-Kanarienvogel.ogg | Jeuwre | CC BY-SA 4.0 | 3 s |  | Rejected by standard: A1 (2.6 s) · expert must confirm M1, M2 |
| Lovebird | Sound of an Agaporni Fisheri.ogg | Américo Toledano | CC BY-SA 3.0 | 21 s | **was shipped in v0.2** | Rejected by standard: A1 (21.2 s) · expert must confirm M1, M2 |
| Lovebird | De-Pfirsichköpfchen.ogg | Jeuwre | CC BY-SA 4.0 | 2 s |  | Rejected by standard: A1 (2.1 s) · expert must confirm M1, M2 |
| Cucak kutilang jambul (chào mào) | Pycnonotus jocosus Pune (27 April 2023).ogg | Ashwin Baindur | CC BY-SA 4.0 | 42 s | **was shipped in v0.2** | Rejected by standard: A1 (41.6 s), A6 (22050 Hz) · expert must confirm M1, M2, M3 |
| Cucak kutilang jambul (chào mào) | 181021 0020 Red-whiskered Bulbul.wav | T. R. Shankar Raman | CC BY-SA 4.0 | 41 s |  | Rejected by standard: A1 (40.6 s), A2 (-39.9 LUFS · -24.6 dBTP), A3 (0 dB), A4 (0%) · expert must confirm M1, M2, M3 |
| Cucak kutilang jambul (chào mào) | Red-whiskered Bulbul (Pycnonotus jocosus) from E | Manoj Karingamadathil | CC BY-SA 4.0 | 43 s |  | Rejected by standard: A1 (42.5 s) · expert must confirm M1, M2, M3 |
| Gereja (tarung) | Passer montanus - Eurasian Tree Sparrow XC347806 | Derek Paulo | CC BY-SA 4.0 | 16 s | **was shipped in v0.2** | Rejected by standard: A1 (16.1 s), A2 (-20.2 LUFS · -0.6 dBTP) · expert must confirm M1, M2, M3 |
| Gereja (tarung) | Passer montanus - Eurasian Tree Sparrow XC347807 | Derek Paulo | CC BY-SA 4.0 | 25 s |  | Rejected by standard: A1 (25.4 s) · expert must confirm M1, M2, M3 |
| Gereja (tarung) | Passer montanus.ogg | Vladimir Yu. Arkhipov, | CC BY-SA 3.0 | 11 s |  | Rejected by standard: A1 (11.0 s), A2 (-21.8 LUFS · -3.3 dBTP) · expert must confirm M1, M2, M3 |
| Belibis | Lesser whistling duck from Kerala 01.wav | Ganesh Mohan T | CC BY-SA 4.0 | 15 s | **was shipped in v0.2** | Rejected by standard: A1 (15.2 s), A2 (-23.6 LUFS · -5.9 dBTP) · expert must confirm M1, M2, M3 |
| Belibis | Lesser whistling duck from Kerala 02.wav | Ganesh Mohan T | CC BY-SA 4.0 | 7 s |  | Rejected by standard: A1 (7.3 s), A2 (-24.4 LUFS · -2.8 dBTP) · expert must confirm M1, M2, M3 |

**Summary:**
* 17 candidates; **3 pass every automatic check** (kacer ×2, both crops of the same original; kenari ×1), and all 3 still need expert sign-off.
* 5 of the 7 tracks previously shipped fail hard checks (too short, or low-bandwidth sources). The other 2 were never expert-reviewed.
* **Published today: 0 tracks, 0 packs.** That's correct until an expert approves.
* No licence-clean recording exists on Commons for the core contest isian: cililin, cucak jenggot, ciblek, tledekan, cendet, tengkek buto, kapas tembak, trucukan, prenjak, cucak ijo, pleci.

## What's needed to ship a real catalogue

1. **A xeno-canto API key** (free account), so candidates are drawn from thousands of graded SE-Asian recordings: `XC_API_KEY=… npm run catalog:candidates`.
2. **A named expert curator** (a contest judge or senior trainer). Budget about 5 minutes per candidate in `npm run review`.
3. **Partner recordings** for species and dialects the archives don't cover (e.g. Sumatran murai "medan"), recorded under a written licence and held to this same standard.

## Changes in v2 (2 Nov 2026)

| Change | Why |
|---|---|
| **T1** taxonomy check added | Names must be verified, not assumed; it caught the jalak suren split that GBIF still lumps |
| **M4** community-ID check added | iNaturalist research grade is independent evidence for H1 |
| **L1** accepts documented written permission | Unlocks good non-commercial recordings legally (permission-request list) |
| **A1** 45 s → 8 s per clip, with new **P1** ≥ 45 s per species | Real archive clips are short (iNaturalist median ~15 s); variety is guaranteed per species, not per clip |
| **A2** ±1.5 LU → −23 … −18.5 LUFS | Peaky calls would otherwise need ~10 dB of limiting, which alters the song. Limiting is capped at 4 dB, and the band matches the planner's own 0…−3 dB per-play variation |
| Processing: explicit linear gain instead of loudnorm "linear" mode | loudnorm silently fell back to dynamic mode on short or peaky clips (a pipeline bug the standard exposed) |

