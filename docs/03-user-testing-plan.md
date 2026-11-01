# User testing plan: Kicau Coach MVP

*Goal: validate **H1** (structured masteran replaces ad-hoc looping) and **H2** (owners value and trust an objective isian check) within 6 weeks, before investing in native apps or a content catalogue. See [02-prd.md](02-prd.md).*

## 1. Participants

| Segment | n | Recruit via | Screener must-haves |
|---|---|---|---|
| Contestants (beachhead) | 8 | Kicau mania contest venues (lapangan lomba) in Jabodetabek, Yogyakarta and Surabaya; Facebook/WhatsApp community groups | Android phone, does masteran now, ≥1 bird aged 2–8 months **or** actively being trained for isian |
| Breeders / "sekolah burung" | 4 | Breeder associations, Tokopedia/Shopee breeder shops | Trains ≥3 juveniles at a time |
| Hobbyists | 4 | Pasar burung (bird markets), neighbourhood contacts | Keeps ≥1 song bird at home |
| **Expert listeners** (calibration panel) | 3 | Contest judges (juri) or senior trainers | ≥5 years judging or training; paid per session |

Prefer owners of **captive-bred, ringed** birds (research §6). Incentive: Rp150k (≈US$9) e-wallet credit per week of diary participation.

## 2. Study design (3 parts, run in parallel)

### Part A: Moderated usability (week 1, 45 min, in person at home or at the contest field)
Tasks, measured by success, time and errors:
1. Install the PWA and add your bird (target < 2 min).
2. Import your own masteran file and create a Pagi+Malam program.
3. Start a 15-minute session now, then put the phone in Stand-by.
4. Open a tutor track, mark one phrase as isian, and select it as a target.
5. Record your bird for 60 s and read the result back to the moderator: *"Which isian has entered? Which hasn't?"*
6. If the bird won't sing on the day, schedule a second visit rather than simulating it — the product has no demo data.

After the session: **SUS** questionnaire, plus three open questions: *"What would you change?"*, *"Would you trust this score at a contest?"*, *"What would you pay for this?"*

### Part B: 4-week diary / field study (weeks 1–5)
* Testers use the app on their real birds. The app logs events locally.
* Every Sunday: run a 60–120 s check per bird, tap Agree/No on each verdict, and send the **Ekspor data uji** (test-data export) JSON plus a 3-question WhatsApp check-in (top frustration, did the bird change, keep using?).
* The moderator calls in week 2 and week 4 (15 min) to dig into drop-offs.

### Part C: Tracker calibration (weeks 2–4) *(the critical-risk study)*
1. Collect about 60 recordings (bird + target isian pairs) from Part B exports. Testers share audio on opt-in.
2. Each expert independently labels every pair *Masuk / Mulai mirip / Belum* (learned / getting close / not yet), blind to the app's score. The order is randomised and 10% are duplicated to measure each expert's own consistency.
3. Analysis:
   * Expert-vs-expert agreement (Fleiss' κ): this is the ceiling we can expect.
   * App-vs-expert-majority agreement (weighted Cohen's κ). **Target: κ ≥ 0.6**, and within 0.1 of expert-expert κ.
   * Re-fit `SCORE_CONFIG` and the 50/70 thresholds (in `src/dsp/analyze.ts`; first real-data calibration in [05-matcher-calibration.md](05-matcher-calibration.md)) to maximise κ on half the data, then validate on the other half.
   * Error review: listen to every case where the app says Masuk and the experts say Belum (false "learned" verdicts are the most damaging to trust).

## 3. Success metrics and decision rules

| Metric | Source | Go | Iterate | Kill / pivot |
|---|---|---|---|---|
| Task success, tasks 1–5 | Part A | ≥ 80% unaided | 60–80% | < 60% |
| SUS | Part A | ≥ 70 | 55–70 | < 55 |
| Activation (bird + track + 1 session within 48 h) | export events | ≥ 75% | 50–75% | < 50% |
| **H1**: ≥5 sessions/week, sustained 3 weeks | `session_*` events | ≥ 60% of testers | 35–60% | < 35% |
| **H2**: weekly check rate | `check_completed` | ≥ 50% of testers | 25–50% | < 25% |
| **H2**: verdict trust (Agree rate on verdicts) | `verdict_feedback` | ≥ 70% | 50–70% | < 50% |
| **H2**: app–expert κ | Part C | ≥ 0.6 | 0.4–0.6 | < 0.4 |
| Willingness to pay ("would pay Rp25k/month") | interviews | ≥ 40% of contestants and breeders | 20–40% | < 20% |
| Welfare: sessions overriding the daily cap | `session_*` vs cap | < 10% | 10–25% | > 25% → rethink defaults |

**Decision at week 6:**
* **H1 and H2 both pass:** build a native Android wrapper (scheduling with the screen off), the answer-back mode and the licensed catalogue.
* **Only H2 passes:** position the product as a "Cek Isian" (isian checker) tool, and keep playback minimal.
* **Only H1 passes:** become a scheduler/player, and invest in content partnerships.
* **Neither passes:** go back to discovery, with interviews focused on contest preparation.

## 4. Event dictionary (local, exported)

| Event | Props |
|---|---|
| `bird_created` | species, phase, origin |
| `track_imported` | durationSec, mime, source |
| `isian_marked` | lengthSec |
| `targets_changed` | count |
| `material_changed` | count, daysSinceLast, warned |
| `preset_applied` | preset |
| `session_started` / `session_ended` | trigger, minutes / plannedMin, playedSec, wallSec |
| `session_skipped_cap` | — |
| `check_completed` | source, durationSec, targets, ms (analysis time), statuses |
| `verdict_feedback` | vote, status, similarity |

The export removes bird and track names (free text) and contains **no audio**.

## 5. Risks to watch

* **Stand-by reliability.** Android may kill the tab if the phone isn't charging. Track `session_started` triggers against the schedule, and ask testers in check-ins.
* **Recording conditions.** Contest-field noise and cage rattling can affect results. Compare the Agree rate between home and field recordings.
* **Species coverage.** Calibration covers murai and kenari first. Report per species, and don't generalise.
* **Ethics.** If a tester reveals a wild-caught bird, record it without judgement but don't recruit more like them. Check whether the origin-field wording shifts behaviour.

## 6. Test logistics

* **Build:** `npm run build`, then host `dist/` on any HTTPS static host (GitHub Pages, Netlify, Vercel). HTTPS is required for the microphone, Wake Lock and offline mode.
* Share a QR code to the URL, and have testers "Add to Home screen".
* Ship one build per week at most during the study, and record the `version` in exports.
