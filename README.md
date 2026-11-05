# Kicau Coach (birdsong)

> 🤖 **AI agents / new engineers: start with [AGENTS.md](AGENTS.md)** (product rules, architecture, state, decision log).

**Structured song tutoring (*masteran*) and objective isian progress checks for Asian song-bird keepers.**

In Indonesia alone, about a third of Java's households keep cage birds (66–84 million birds), and owners train them by playing "master" songs so they learn *isian* (phrases copied from other species). Today that means looping YouTube or MP3 speakers, following contradictory advice, and waiting weeks with no way to know whether it's working. Kicau Coach is an MVP that tests two features with real owners:

| # | Feature | What it does |
|---|---|---|
| 1 | **Masteran Terjadwal** (Smart Masteran Program) | Pick a **ready-made pack for your bird** (curated, licence-cleared real recordings — no uploads) and it runs morning/night sessions that sound like a tutor, not a tape: shuffled order, natural gaps, level variation, fades. It has a Stand-by mode with auto start and welfare guardrails (daily cap, a "don't change material too soon" warning, a low-volume note for moulting birds), and logs every session. |
| 2 | **Cek Isian** (Isian Progress Check) | Mark target phrases on a tutor track's spectrogram, then record your bird for 30–120 s. On-device analysis tells you which isian is **Masuk / Mulai mirip / Belum** (learned / getting close / not yet), with a similarity %, how often it was heard and where (tap to listen). It also gives contest-style indicators (singing time, *kerja* (activity), phrases, *variasi* (variety), loudness) and a progress chart over weeks. |

The UI is in Bahasa Indonesia by default, with an English toggle. Everything runs offline, on the device, with no backend.

📄 **Product docs:** [Research](docs/01-research.md) · [PRD](docs/02-prd.md) · [User-testing plan](docs/03-user-testing-plan.md) · [Content strategy](docs/04-content-strategy.md) · [Content standard](docs/06-curation-standard.md) · [Species coverage (v0.4)](docs/07-species-coverage.md)

## Try it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (DSP + planner)
npm run build      # static PWA in dist/, deploy on any HTTPS host
[XC_API_KEY=...] npm run catalog:candidates # 1. iNaturalist (+ xeno-canto with key) + Commons → review/ (never shipped)
npm run review                               # 2. expert curator listens & signs off (dev-only tool)
npm run catalog:publish                      # 3. publish ONLY approved, standard-compliant tracks
npm run calibrate                            # research: matcher accuracy on real candidates
```

## Curated catalogue

Owners never upload music, and **the product contains no dummy, sample or synthetic media.** Every published sound is a real, licence-cleared field recording that passes the [Kicau Coach content standard](docs/06-curation-standard.md) (licence & TASL attribution, ≥ 45 s, BS.1770 loudness, SNR, no clipping, full bandwidth, archive grade, region) **and** is signed off by a named expert (judge / senior trainer) who also names the isian. The candidate builder only produces review material; `catalog:publish` is the single gate into `public/catalog/` and re-validates everything. Credits (title, author, source, licence, modifications, curator) are in `public/catalog/ATTRIBUTION.md` and inside the app.

**Coverage (v0.4):** 36 species in a data-driven registry (25 trainable target birds, 21 isian sources), GBIF-verified names, legal/conservation notices, up to 4 clips per species and an auto-generated basic pack per target bird. See [species coverage](docs/07-species-coverage.md) for what is available, what needs permission, and what is still missing. **Published today: 0 tracks** until an expert approves.


## How the isian check works

```
recording ─► resample 22.05 kHz ─► STFT (512 / hop 256) ─► 40-band log-mel, 0.8–10 kHz
         ─► background floor per band ─► "energy above background" frames
         ─► syllables (adaptive threshold + hysteresis) ─► phrases (gaps < 120 ms merge)
         ─► subsequence DTW of each target isian vs each phrase
               · cosine frame distance (loudness/mic-distance invariant)
               · ±1 band pitch tolerance, 0.5–2× tempo, non-diagonal penalty
         ─► similarity 0–100 ─► Masuk ≥ 70 · Mulai mirip ≥ 50 · Belum
         ─► greedy phrase clustering ─► variasi
```

The analysis runs in a Web Worker. 120 s of audio against 10 targets takes about 1 s on desktop. The thresholds are **initial values**, to be calibrated against expert judges in the user test.

## Why not generate the masteran audio with AI?

Birds copy what they hear, artifacts included, and neural vocoders still struggle with birdsong pitch and voicing. We **use real recordings and generate the *program*** (order, gaps, levels, schedule) instead. See [research §5](docs/01-research.md#5-build-vs-generate-should-we-synthesize-masteran-audio).

## Project layout

```
src/dsp/        FFT, spectrogram, segmentation, DTW, analysis, worker
src/review/     curator review tool (dev-only, not in the production build)
scripts/        content standard, licence policy, candidate builder, publisher
review/         candidates awaiting expert review (never shipped)
src/audio/      session planner (pure), playback engine, recorder, decoding
src/screens/    Birds, BirdForm, BirdDetail (Masteran / Cek Isian / Progres tabs), Player, Library, TrackEditor, More
src/components/ Spectrogram (tappable phrases), Charts (line + daily bars)
tests/          Vitest: analyser accuracy (synthetic fixtures in tests/fixtures/ only), planner, licence, content standard
docs/           research, PRD, user-testing plan
```

## Known limitations (MVP)

* **Stand-by** needs the tab open and the screen awake (Wake Lock). Scheduling with the screen off needs a native wrapper (planned for v1.1).
* The isian editor only works on tracks up to 5 minutes (phone memory). Longer tracks still play for masteran.
* The loudness score is uncalibrated (dB above background), so only compare recordings made from the same phone position.
* The similarity thresholds are not yet calibrated against expert listeners (see the test plan, part C).
