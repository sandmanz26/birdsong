# PRD: Kicau Coach MVP (two testable features)

*Status: v0.2 — curated catalogue replaces user uploads (see [04-content-strategy.md](04-content-strategy.md)). MVP built and ready for user testing. Owner: Product/Eng. Research basis: [01-research.md](01-research.md), referenced below as R1–R14.*

## Problem

Tens of millions of Asian song-bird owners train their birds with *masteran* (tutor song) (R1, R4). Today that means looping YouTube or MP3 speakers with **no structure**, following **contradictory advice** (R5, R6), and spending **weeks with no idea whether it's working** (R7). Science says the *way* a song is presented matters, and that more exposure is not always better (R8, R9). Similarity can be measured objectively (R10), yet no consumer tool does this.

## Goal of this MVP

Validate two hypotheses with real owners in 4–6 weeks, at the lowest possible build cost:

| | Hypothesis | We'll know it's true when… |
|---|---|---|
| **H1** | Owners will replace ad-hoc YouTube/MP3 looping with a **structured, scheduled masteran program**. | ≥60% of testers run ≥5 sessions/week for 3 weeks, and SUS ≥ 70. |
| **H2** | Owners **value and trust an objective "which isian has entered" check**. | Tracker verdicts agree with expert listeners at κ ≥ 0.6, ≥50% of testers run a check weekly, and ≥40% say they'd pay for it. |

**Non-goals for the MVP:** accounts, cloud sync, a marketplace, social and contest features, **user music uploads** (replaced by the curated catalogue in v0.2), iOS-native background scheduling, and AI-generated audio.

## Users

The primary user is the **Contestant** (the beachhead), with **Breeders** (multi-bird) secondary and **Hobbyists** later. See the research doc §2 for the segment table.

---

## Feature 1: Masteran Terjadwal (Smart Masteran Program)

> *"Set the program once and leave the phone by the cage. The app runs masteran properly and records what was played."*

### User stories
1. As an owner, I **pick a ready-made masteran pack for my bird's species** (e.g. "Murai batu – Isian dasar"). One tap downloads curated, licence-cleared real recordings and sets up the material, schedule and isian targets. I never have to find or upload audio. *(v0.2 — replaces importing own files)*
2. I **create a program for a bird**: pick tracks, choose a preset (Pagi / Malam / Pagi+Malam), and adjust session times, duration and volume.
3. I **start a session now**, or put the phone in **Stand-by** so sessions start automatically at the scheduled times.
4. The app **plays like a tutor, not a tape** (R8): random order, natural silent gaps, 0 to −3 dB level variation (never boosts, so it never clips), 30 s fade-in/out, and long tracks played whole.
5. The app **protects my bird** (R6, R9). It caps daily minutes (default 180), warns before I exceed the cap, defaults night volume to low, and warns if I change the track set less than 14 days after the last change ("biarkan materi 2–4 minggu").
6. I see a **log** of sessions: when, how long, and which tracks.

### Functional requirements
| ID | Requirement |
|---|---|
| F1.1 | Curated catalogue (`public/catalog/catalog.json` + audio) built by the content pipeline. Installing a pack stores its audio in IndexedDB (offline). Stable ids (`cat:<id>`) make installs idempotent and shared between birds. The Library is a read-only catalogue with preview and credits. |
| F1.2 | Program = tracks[] + sessions[] {start HH:MM, minutes, volume 0–1} + gapMin/gapMax seconds + dailyCapMinutes + materialChangedAt. |
| F1.3 | The **session planner** is a pure, seeded function: (tracks, duration, gaps, seed) → timeline of {track, startAt, offset, length, gainDb}. It never exceeds the session length, and no clip plays immediately after itself if an alternative exists. Unit-tested. |
| F1.4 | **Audio engine.** Web Audio with look-ahead scheduling (it schedules about 60 s ahead every 5 s, which survives timer throttling while audio is audible), a master gain with fades, and a Stop that fades in 2 s. |
| F1.5 | **Stand-by mode.** It holds a Screen Wake Lock, starts at the next scheduled time, and shows a big countdown. *Known limitation:* the browser tab must stay open; native scheduling is v2. |
| F1.6 | **Guardrails.** Daily cap, change-too-soon warning, and a mandatory caution if the bird's age phase is "mabung" and the volume is above 0.6. |
| F1.7 | Every session writes a SessionLog {birdId, start, end, playedMinutes, trackIds}. |

### Defaults (adjustable; sources R6, R9)
* Pagi (morning) 06:30, 60 min, volume 0.7 · Malam (night) 19:00, 60 min, volume 0.35.
* Gap 2–8 s between short clips. Clips longer than 60 s play whole, with gaps of 10–30 s.
* Daily cap 180 min.

---

## Feature 2: Cek Isian (Isian Progress Check)

> *"Record my bird for a minute. The app tells me which target isian it now sings, how closely, and how it's trending week by week."*

### User stories
1. The isian in my pack are **already marked** by the content pipeline (the most frequent phrase types of each curated track), so they are my bird's targets from day one. *(Advanced: I can still tap another phrase on a track's spectrogram to add a target.)*
2. I **record the bird** for 30–120 s in-app (raw mic, with AGC, noise suppression and echo cancellation **off**), or **upload** a recording or WhatsApp video.
3. The app shows, for each target isian: **status** (✅ Masuk = learned / 🟡 Mulai mirip = getting close / ⬜ Belum = not yet), **best similarity %**, **number of times heard**, and the timestamp to jump to and listen.
4. It also shows **contest-style indicators** (R7): *Durasi kicau* (seconds of song), *Kerja* (% of time singing), *Jumlah frasa* (number of phrases), *Variasi* (distinct phrase types), and *Volume relatif* (relative loudness, uncalibrated, to compare like-with-like only).
5. A **Progress** view charts the best score per isian over time, plus variasi and kerja.

### Analysis pipeline (runs on-device in a Web Worker)
1. **Resample** to mono 22.05 kHz.
2. **STFT** (512-sample Hann window, hop 256 ≈ 11.6 ms) and a **40-band log-mel spectrum, 0.8–10 kHz** (R14).
3. **Segmentation.** Estimate the noise floor per band, then compute the frame activity in dB above the floor, an adaptive threshold, hysteresis and a minimum syllable length. Syllables less than 120 ms apart merge into phrases.
4. **Features per frame.** Excess energy over the noise floor (≥0), compared by cosine distance, so the score is invariant to distance from the mic.
5. **Matching** uses subsequence DTW of each target against each phrase. It allows ±1 mel-band pitch shift, a length ratio of 0.5–2.0, and a small non-diagonal penalty. Local minima become occurrences. Similarity runs 0–100 via a calibrated linear map of normalised path cost.
6. **Variasi.** Greedy clustering of the bird's phrases by DTW similarity (threshold 60).
7. **Verdict thresholds:** Masuk ≥ 70, Mulai mirip 50–69, Belum < 50. *These are initial values. The user test calibrates them against expert labels (see the test plan).*

### Requirements
| ID | Requirement |
|---|---|
| F2.1 | The pipeline is pure TypeScript with no native dependencies, and is unit-tested with synthetic signals: identical, noisy, pitch-shifted, time-stretched and different phrases. |
| F2.2 | Analysing a 120 s recording against 10 targets finishes in under 5 s on a mid-range Android phone, and the UI stays responsive (Web Worker). |
| F2.3 | Results are stored with the recording, so they can be re-analysed if the algorithm improves (the version is stored). |
| F2.4 | **Demo data.** One tap generates a synthetic "tutor" and a "bird" recording so testers can try the flow without a bird. It is labelled *Demo*. |

---

## Cross-cutting

* **Platform:** an installable **PWA**, Android Chrome first (R1: Android-dominant), offline after first load.
* **Language:** Bahasa Indonesia by default, with an English toggle.
* **Privacy:** no backend. **Export data uji** (test-data export) produces a JSON of programs, logs and check results (no audio), which testers send to the research team.
* **Ethics** (research §6): a bird origin field (captive-bred with ring number / wild / unknown), plus welfare guardrails. No trading features.

## Metrics (instrumented via the local event log, exported)
* Activation: a bird created, ≥1 track, and ≥1 session run within 48 h.
* Engagement: sessions per bird per week, checks per bird per week.
* Trust: % of checks where the user taps "Setuju / Tidak setuju" (agree / disagree) on a verdict. This is the human label, and it calibrates the thresholds.
* Outcome (cohort, 4–8 weeks): change in best isian score per target over time.

## Roadmap after validation
* **v1.1:** Native Android wrapper (Capacitor) with AlarmManager scheduling and Bluetooth speaker presets.
* **v1.2:** "Jawab" (answer-back) **contingent mode**: the mic detects the bird singing and the app replies with a tutor phrase, capped per day (R8, R9).
* **v1.3:** Licence-checked xeno-canto catalogue, plus a community library with attribution.
* **v2:** Breeder multi-bird dashboard, a shareable progress certificate for ringed birds, Vietnamese locale (chào mào), and model-based similarity (an embedding network) trained on the labels collected in v1.
