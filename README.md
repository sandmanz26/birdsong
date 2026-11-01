# Kicau Coach (birdsong)

**Structured song tutoring (*masteran*) and objective isian progress checks for Asian song-bird keepers.**

In Indonesia alone, about a third of Java's households keep cage birds (66–84 million birds), and owners train them by playing "master" songs so they learn *isian* (phrases copied from other species). Today that means looping YouTube or MP3 speakers, following contradictory advice, and waiting weeks with no way to know whether it's working. Kicau Coach is an MVP that tests two features with real owners:

| # | Feature | What it does |
|---|---|---|
| 1 | **Masteran Terjadwal** (Smart Masteran Program) | Pick a **ready-made pack for your bird** (curated, licence-cleared real recordings — no uploads) and it runs morning/night sessions that sound like a tutor, not a tape: shuffled order, natural gaps, level variation, fades. It has a Stand-by mode with auto start and welfare guardrails (daily cap, a "don't change material too soon" warning, a low-volume note for moulting birds), and logs every session. |
| 2 | **Cek Isian** (Isian Progress Check) | Mark target phrases on a tutor track's spectrogram, then record your bird for 30–120 s. On-device analysis tells you which isian is **Masuk / Mulai mirip / Belum** (learned / getting close / not yet), with a similarity %, how often it was heard and where (tap to listen). It also gives contest-style indicators (singing time, *kerja* (activity), phrases, *variasi* (variety), loudness) and a progress chart over weeks. |

The UI is in Bahasa Indonesia by default, with an English toggle. Everything runs offline, on the device, with no backend.

📄 **Product docs:** [Research](docs/01-research.md) · [PRD](docs/02-prd.md) · [User-testing plan](docs/03-user-testing-plan.md) · [Content strategy](docs/04-content-strategy.md)

## Try it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (DSP + planner)
npm run build      # static PWA in dist/, deploy on any HTTPS host
XC_API_KEY=... npm run catalog   # (re)build the curated masteran catalogue
```

## Curated catalogue

Owners never upload music. `npm run catalog` builds `public/catalog/` from licence-cleared field recordings (xeno-canto + Wikimedia Commons): it picks the best recording per species, cuts the most song-dense 90 s, cleans and normalises it, runs QC with the app's own analyser and **pre-marks isian**, then assembles packs per bird species (`content/packs.json`). Licence policy (`scripts/license.ts`): commercial = CC0/BY/BY-SA, never ND. Credits are in `public/catalog/ATTRIBUTION.md` and inside the app. Expert curation lives in `content/curation.json`. Details: [content strategy](docs/04-content-strategy.md).

Tap **"Coba dengan data demo"** ("try with demo data") to get a demo bird with a 3-week learning curve, without a real bird. The demo audio is synthetic and clearly labelled. It exists only to demonstrate the app, never as training material.

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
src/dsp/        FFT, spectrogram, segmentation, DTW, analysis, worker, synthetic test signals
src/audio/      session planner (pure), playback engine, recorder, decoding
src/screens/    Birds, BirdForm, BirdDetail (Masteran / Cek Isian / Progres tabs), Player, Library, TrackEditor, More
src/components/ Spectrogram (tappable phrases), Charts (line + daily bars)
tests/          Vitest: analysis accuracy on synthetic birds, planner properties
docs/           research, PRD, user-testing plan
```

## Known limitations (MVP)

* **Stand-by** needs the tab open and the screen awake (Wake Lock). Scheduling with the screen off needs a native wrapper (planned for v1.1).
* The isian editor only works on tracks up to 5 minutes (phone memory). Longer tracks still play for masteran.
* The loudness score is uncalibrated (dB above background), so only compare recordings made from the same phone position.
* The similarity thresholds are not yet calibrated against expert listeners (see the test plan, part C).
