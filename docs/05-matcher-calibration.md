# Isian matcher: calibration on real recordings

*Nov 2026, v0.2. This complements the synthetic unit tests, which turned out to be too easy.*

## What we found

The first catalogue build gave us real, dense field recordings. Matching every track against every other species' auto-marked isian showed the v0.1 matcher was far too permissive:

| | v0.1 (synthetic-tuned) | v0.2 (real-data calibrated) |
|---|---|---|
| False "Masuk" (cross-species pair scored ≥ 70) | **23 / 72 (32%)** | **3 / 66 (4.5%)** |
| False "Mulai mirip" (50–69) | 25 / 72 | 5 / 66 |
| Same-recording repeats found | ✓ | ✓ |

Real recordings carry 15–70 phrases each, which gives many chances for an accidental match. The auto-picked isian were also very short (0.27–0.36 s), and the score mapping had been fitted to clean synthetic chirps.

## Method

The harness is `calibrate.ts` (run during development): 7 catalogue tracks, 12 auto-marked isian.

* **Genuine pairs:** an isian template is matched against its own track, with the template's own occurrence masked out, so only *other* occurrences of the same phrase type can match.
* **Impostor pairs:** the same template matched against the other species' tracks.
* **Grid:** frame distance (cosine vs shape correlation), warping penalty, pitch tolerance (±1 band vs none), tempo window, and minimum isian length (0.25 / 0.4 / 0.5 s).

| Finding | Evidence | Decision |
|---|---|---|
| Score mapping was the main bug. Genuine cost ≈ 0.15–0.18, impostors ≈ 0.30–0.50, but 0.20 used to map to "Masuk" | Median costs across the grid | `SCORE_CONFIG` refit: 70 sits at the cost where ≈5% of impostors pass (cost 0.19), 50 at about 0.24 |
| Longer isian are much more distinctive | Median impostor cost 0.27 → 0.46–0.54 with min length 0.5 s | Auto-isian must be ≥ 0.5 s. Shorter calls (e.g. gereja tarung) are marked by experts in `curation.json` → `isianManual` |
| Tighter tempo window helps | AUC 0.925 → 0.936–0.947 | Tempo window 0.75–1.35× |
| Shape correlation is no better than cosine | AUC within noise | Keep cosine (simpler) |
| Pitch tolerance costs little | Within noise | Keep ±1 band, since imitations drift in pitch |

**Caveat: the sample is small** (11–12 genuine templates, 66–72 impostor pairs, one recording per species). Treat these numbers as directional. The remaining false "Masuk" cases include the magpie-robin (kacer) scoring 88 against a bulbul isian. Magpie-robins are mimics, so this may be a *true* imitation inside the recording, and only expert listeners can tell. That is exactly what Part C of the [user-testing plan](03-user-testing-plan.md) measures. Re-run the harness once xeno-canto fills the catalogue (3+ recordings per species), and again on expert-labelled bird recordings.

## v0.4 — validation at scale (2 Nov 2026)

`npm run calibrate` on the v0.4 candidate set: **153 clean real recordings, 29 species, 145 isian templates, 10,354 cross-species impostor pairs** (vs. 7 recordings / 66 pairs in v0.2). Genuine = the same phrase type repeated elsewhere in the same recording; impostor = other species. Cohort statistics and evaluation use disjoint species halves.

| Method | AUC | Genuine accepted at 5% false matches |
|---|---|---|
| **Raw path cost (shipped)** | **0.900** | **63.4%** |
| Cohort normalisation (Z-norm) | 0.893 | 40.7% |

**Z-norm is not adopted.** It is a standard fix in speaker verification, but on this data it is worse. The code stays opt-in (`SCORE_CONFIG.mode = 'znorm'`, `catalog:publish --cohort`) so it can be re-tested on expert-labelled data.

**Operating points (raw score):**

| False-match rate | Cost threshold | Genuine accepted |
|---|---|---|
| 1% | — | 36.6% |
| 2% | 0.20 | 49.7% |
| 5% | 0.23 | 63.4% |
| 10% | 0.26 | 72.4% |
| 20% | 0.31 | 87.6% |

**The shipped mapping holds up at scale:** "Masuk" (70) sits at cost 0.19, which is **2.0% false matches**; "Mulai mirip" (50) sits at 0.24, which is **6.1%**. The v0.2 fit from only 7 recordings generalises. The policy is now stated as measured: *"Masuk" ≈ 2% false matches* (deliberately stricter than 5%, because a false "learned" verdict is the costliest error for owner trust), and *"Mulai mirip" ≈ 6%*. Genuine renditions that miss "Masuk" still show as "Mulai mirip" (64.8% reach it).

**Limitations.** Genuine pairs here are a bird repeating its *own* phrase. A pupil imitating a tutor varies more, so real recall for learned isian is probably lower than these numbers. Part C of the user test (expert-labelled pupil recordings) remains the decisive calibration.
