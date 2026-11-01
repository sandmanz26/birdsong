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
