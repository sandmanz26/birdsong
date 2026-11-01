# Research: song training for cage birds in Asia

*Prepared 2026-11-01. This covers the market, the users, how training works today, the science behind it, and the technical options. Every product decision in [02-prd.md](02-prd.md) traces back to a numbered finding here (R1–R14).*

---

## 1. TL;DR

* **The market is large, real, and centred on Indonesia.** About one-third of Java's ~36M households keep cage birds, an estimated **66–84 million birds on Java alone** (R1). The Indonesian government values the *kicau mania* (songbird hobby) economy at **Rp1.7–2 trillion/yr**. That figure is top-down and disputed, but it has been repeated consistently since 2018 (R2). Vietnam (red-whiskered bulbul / *chào mào*), southern Thailand (bulbul and zebra-dove contests), Malaysia and Singapore have parallel cultures (R3).
* **Song training ("masteran") is the core ritual.** Owners expose young birds to a "master" song so they pick up *isian*: phrases copied from other species. That exposure comes from a live tutor bird or, increasingly, from MP3/YouTube audio played through a speaker (R4). Training starts at about 2 months and runs until 7–8 months (R4).
* **Today's tooling is primitive.** It is YouTube loops, cheap MP3 speakers pre-loaded with "333 suara" from Tokopedia, and low-quality single-species soundboard apps (R5). Advice is **contradictory**: 30 min/day, or 2–3 h per session, or all night (R6).
* **Nobody can measure whether training is working.** Owners judge progress by ear over weeks or months. Contest judging is acknowledged as subjective, and academics already propose spectrogram analysis as the fix (R7).
* **The science supports a structured, *limited*-exposure tutor.** In zebra finches, more tutor song can mean *worse* imitation (R9). Tape tutors underperform live tutors partly because tape playback is **stereotyped and non-contingent** (R8). Similarity between tutor and pupil can be scored automatically and objectively (R10).
* **Ethics is part of the product, not a footnote.** The trade drives the "Asian Songbird Crisis" (R13). A training tool should favour captive-bred, ringed birds and build in welfare limits.

**Product implication.** The opportunity is not "yet another bird-sound player". It is the first tool that **(1) runs masteran as a structured, research-informed program** and **(2) objectively tells the owner which isian has been learned**.

---

## 2. Market

| # | Finding | Source |
|---|---|---|
| R1 | 2018 household survey (n=3,040, all 6 provinces of Java): **one-third of households keep cage birds, an estimated 66–84M birds**. Keeping is higher in the eastern provinces (Central Java, DIY, East Java). An SMS survey estimated a further **69.7M songbirds owned outside Java**. | [Marshall et al. 2020, *Biol. Conserv.*](https://www.sciencedirect.com/science/article/abs/pii/S0006320719309292); [MMU press release](https://www.mmu.ac.uk/news-and-events/news/story/10987/); [Oryx SMS survey](https://www.cambridge.org/core/journals/oryx/article/using-sms-surveys-to-understand-songbird-ownership-and-shark-product-consumption-in-indonesia/607A8E0A38E75ECA4561A50119E6D7B6); earlier 6-city survey [Jepson & Ladle 2009](https://www.cambridge.org/core/journals/oryx/article/governing-birdkeeping-in-java-and-bali-evidence-from-a-household-survey/9F34F94A49E43D14622F20F8ED35F642) |
| R2 | Economic value of the songbird ecosystem: **Rp1.7–2T/yr** (Trade Minister, May 2026; same figure cited by President Jokowi in 2018). The bird community itself questions the methodology. Bottom-up check: one Surakarta market (Pasar Depok) turned over ~Rp1B in 3 months with more than 7,000 birds traded. | [CNN Indonesia 2026](https://www.cnnindonesia.com/ekonomi/20260505112737-94-1355204/foto-nilai-ekonomi-ekosistem-kicau-mania-tembus-rp2-t/amp); [Antara Jogja](https://jogja.antaranews.com/berita/825812/mendag-ungkap-nilai-ekonomi-dari-ekosistem-burung-kicau-capai-rp2-t); [Bisnis.com 2018](https://kabar24.bisnis.com/read/20180311/15/748371/jokowi-perputaran-uang-di-bisnis-burung-capai-rp17-triliun-setahun); [Suara Surabaya 2026](https://www.suarasurabaya.net/ekonomibisnis/2026/lomba-burung-kicau-dorong-ekonomi-umkm-dan-peternak-di-indonesia/) |
| R3 | **Regional cultures.** *Vietnam:* chào mào (red-whiskered bulbul) is the top contest bird. Provincial contests draw 140–200+ birds, trainers are called *nghệ nhân* (artisans), and 70% of keepers are leisure keepers vs 30% competitive. *Thailand:* the 23rd Surat Thani red-whiskered bulbul contest ran in Oct 2026; zebra-dove cooing contests have run for more than 100 years in the south, top birds sell for more than US$90k, and the bulbul's protected status was changed in 2026. *China:* hwamei has long been kept as a song bird. *Japan:* Edo-era song-training culture. | [Saigoneer](https://saigoneer.com/parks-and-rec/27276-i-know-where-the-caged-bird-sings-the-joy-of-saigon-s-birdsong-competition); [Bình Dương](https://baobinhduong.vn/en/2nd-provincial-red-whiskered-bulbul-singing-contest-absorbs-over-140-birds-a132265.html); [TRAFFIC VN briefing](https://www.traffic.org/site/assets/files/14589/traffic_songbird_briefing_design_ngoctramcreative_final_june2021_e-version.pdf); [Pattaya Mail](https://www.pattayamail.com/thailandnews/surat-thani-bird-singing-contest-draws-enthusiasts-after-protection-status-change-569896); [Khaosod 2026](https://www.khaosodenglish.com/life/animal/2026/07/21/thailand-to-remove-red-whiskered-bulbul-from-protected-wildlife-list-to-promote-breeding-industry/); [Gulf Times](https://www.gulf-times.com/story/433616/thailands-singing-zebra-doves-can-fetch-more-than-90000/amp); [Wikipedia: Chinese hwamei](https://en.wikipedia.org/wiki/Chinese_hwamei); [IUPUI: Japan bird-keeping history](https://scholarworks.indianapolis.iu.edu/items/3ad5aac2-c18f-434b-99c9-44ab65617bcc) |

**Beachhead: Indonesia, Bahasa Indonesia first.** It has the largest population, the strongest masteran tradition, Android-dominant users and a dense contest calendar. Vietnam's chào mào scene is the logical second market.

### User segments (R12)

Marshall et al. (2020, *People and Nature*) interviewed nearly 1,000 Javan keepers and found three groups: **hobbyists** (the largest group: few, cheap, mostly native birds, middle-aged), **contestants** (younger, urban, in business), and **breeders**. People move between groups within two years. ([MMU repository](https://e-space.mmu.ac.uk/626359), [BES summary](https://www.britishecologicalsociety.org/characterising-wildlife-consumers-to-guide-behaviour-change-efforts-provides-optimism-amid-the-asian-songbird-extinction-crisis/))

| Segment | Job to be done | Pain | Willingness to pay |
|---|---|---|---|
| **Contestant** (beachhead) | "Get my murai/kenari to *full isian* before the next lomba (contest)." | Can't tell if the masteran is working, and wastes weeks on the wrong material. | High: birds sell for millions of rupiah, and murai prices can match a car ([GNFI](https://www.goodnewsfromindonesia.id/2024/01/25/mengenal-burung-murai-batu-yang-harga-belinya-bisa-setara-mobil-apa-alasannya)). |
| **Breeder / "sekolah burung"** | Train many trotolan (juveniles) in batches and sell them as "sudah masteran" (already trained). | Manual scheduling across many birds; no proof of training to show buyers. | High: a progress report raises the sale price. |
| **Hobbyist** (largest) | "My bird should sing nicely at home." | Confusing, contradictory advice; YouTube ads interrupt loops. | Low: freemium. |

---

## 3. How masteran is done today

| # | Finding | Source |
|---|---|---|
| R4 | A Boyolali "bird school" starts murai at about **2 months old** and runs masteran **continuously until 7–8 months**, often playing **several masters at once**. Owners use live master birds *or* recorded audio. The common masters are murai batu, cucak jenggot, ciblek, cendet, cililin and belibis. | [detik.com: Sekolah Burung Boyolali](https://news.detik.com/berita-jawa-tengah/d-4433506/mengintip-sekolah-burung-di-boyolali); [RRI](https://www.rri.co.id/hobi/957872/tips-merawat-murai-batu-agar-tetap-sehat-dan-gacor); [GNFI cendet](https://www.goodnewsfromindonesia.id/2026/02/09/burung-cendet-jagal-kecil-khas-jawa-yang-bantu-mengendalikan-hama); [GNFI belibis](https://www.goodnewsfromindonesia.id/2022/10/10/daya-pikat-belibis-keindahan-siulan-yang-bisa-dihargai-jutaan-rupiah) |
| R5 | **Tooling.** People buy MP3 speakers pre-loaded with hundreds of songs ("isian 333 suara") on Tokopedia, play YouTube/MP3 long-play tracks, or use single-species soundboard apps (e.g. "Lovebird Ngetik Ngekek Offline", last updated 2021). None of these have scheduling, progress tracking or welfare limits. | [Tokopedia: masteran burung mp3](https://www.tokopedia.com/find/masteran-burung-mp3); [Tokopedia: mp3 masteran murai](https://www.tokopedia.com/find/mp3-masteran-murai); [Cafe Bazaar listing](https://cafebazaar.ir/app/com.rajekwesi.lovebird.ngetik.ngekek.offline?l=en); [Duniakicau](https://duniakicau.net/suara-murai-batu/) |
| R6 | **Contradictory community advice.** *Night:* 19:00–21:00 at low volume for 30–60 min, or 18:00 until 21:00 or even 02:00, or "from night until morning". *Session:* 2–3 h maximum, because all-day playback causes stress. *Canary:* at least 30 min/day. *Volume:* "like normal conversation", or 60–70 dB with the speaker 1–2 m from the cage. *Rotation:* **don't change material too often; keep it for 2–4 weeks** until the bird has learned it. *Best timing:* during moult (mabung), when the bird is calm. Use clear, unbroken recordings, and an unfit bird won't absorb anything. | [Suara Merdeka](https://www.suaramerdeka.com/gaya-hidup/0415021867/inilah-waktu-terbaik-memutar-audio-masteran-burung-murai-batu-agar-cepat-ngeplong-dan-bocor?page=2); [Radar Kediri](https://radarkediri.jawapos.com/hobi/786385257/rahasia-pemasteran-murai-batu-biar-gacor); [Dhaha News](https://www.dhahanews.com/hobi/5759519404/3-waktu-pemasteran-murai-batu-dengan-mp3-yang-benar-agar-bisa-diserap-dan-ditiru-dengan-cepat?page=2); [Koran Gala](https://www.koran-gala.id/gala-ragam/58711629033/3-pilihan-waktu-untuk-melakukan-mastering-pada-burung-kenari-berikut-caranya-baik-menggunakan-burung-masteran-langsung-maupun-rekaman); [Belajar Beternak](https://belajarterernak.com/suara-burung-masteran/); [Yukternak](https://yukternak.com/suara-burung-murai-batu/) |
| R7 | **Contest judging** weighs *irama/lagu* (rhythm and song variety), *volume*, *durasi kerja* (working duration), *gaya/fisik* (style and physique) and stability. Judging is acknowledged as **subjective**, and Indonesian theses already propose spectrogram-based scoring. | [i-SAPI / Unram](https://journal.unram.ac.id/index.php/i-sapi/id/article/view/11251); [IPB repository](https://repository.ipb.ac.id/handle/123456789/109147?show=full); [Dinamika thesis](https://repository.dinamika.ac.id/id/eprint/1846/3/BAB_II.pdf) |

**Insight.** Because the advice conflicts (R6), the product should not hard-code one "truth". It should ship **sensible, adjustable defaults with guardrails**, and the progress checker (Feature 2) lets each owner find out what actually works for *their* bird. The product's data then becomes the evidence base the hobby lacks.

---

## 4. Science of song learning, and what it means for design

| # | Finding | Design implication |
|---|---|---|
| R8 | Many species learn **less from playback than from live tutors**. Proposed reasons: tape is **stereotyped**, has **no circadian pattern**, and is **non-interactive / non-contingent**. Visual cues may also matter. Tape-tutored starlings acquired smaller repertoires with less stable sequencing. ([Leiden thesis chapters](https://scholarlypublications.universiteitleiden.nl/access/item%3A3483925/view); [Derégnaucourt review](https://hal-univ-paris10.archives-ouvertes.fr/hal-01478479/file/Deregnaucourt_JPhysiol_revision.pdf); [Frontiers 2021](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.593532/pdf)) | The player **must not loop one file robotically**. Add randomised order, natural gaps, slight level variation, and time-of-day scheduling. A *contingent* "answer-back" mode (playing a tutor phrase when the bird sings) is a v2 hypothesis. |
| R9 | **More is not better.** Zebra finches given *limited* tutor exposure imitated better than those given abundant exposure (Tchernichovski et al. 1999, *PNAS* 96:12901, "Vocal imitation in zebra finches is inversely related to model abundance"). Operant, self-triggered tutoring with capped daily playbacks produced good learning (Tchernichovski et al. 2001, *Science* 291:2564). *From prior literature, not re-fetched in this session.* | **Daily caps and session limits are a feature, not a restriction.** The default is 2 sessions/day with a 3 h/day cap, and the app warns the user above that. |
| R10 | Tutor–pupil **similarity can be scored automatically**. Sound Analysis Pro reports % similarity (how much of the tutor's sound appears in the pupil's) and frame-level accuracy, from feature-based distances. Newer deep-learning tools (AVN) correlate with expert human judgement. | Feature 2 follows the same idea: **% of tutor phrase matched in the bird's recording, from spectral features and time-warped alignment**. Calibrate against expert ears. ([SAP manual](https://soundanalysispro.com/manual/chapter-10-similarity-measurements/the-similarity-score); [AVN, eLife](https://elifesciences.org/reviewed-preprints/101111/figures); [Automated evaluation of imitation](https://paperity.org/p/60394237/an-automated-procedure-for-evaluating-song-imitation)) |
| R11 | **Sensitive periods.** Zebra finches learn at roughly 20–65 days and crystallise at about 90 days. Open-ended learners and mimics (shama, starling) keep learning, and wild shamas mimic **at least 28 species** from their local soundscape. Sleep plays a role in consolidating song (Derégnaucourt et al. 2005, *Nature*; prior knowledge). | Track the **bird's age and phase** (trotolan / young / adult / moulting). Juveniles in their learning window are the highest-value users of the tracker. Mimicry of whatever is *around* the bird is real, so the app should also count **untargeted new phrases** ("variasi"). ([Shama mimicry, R. Soc. Open Sci. 2025](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11919489/); [ESJ abstract](https://www.esj.ne.jp/meeting/abst/71/P2-056.html)) |
| R14 | **Hearing.** Songbird hearing is most sensitive at **2–4 kHz** and falls off steeply above about 5–6 kHz, roughly 35 dB/octave from 4–9 kHz in one species. | Analyse **0.8–10 kHz**. Phone speakers reproduce this band adequately, and a 22.05 kHz sample rate is sufficient. Warn users that Bluetooth "voice" codecs and heavy MP3 compression cut highs. ([Henry & Lucas 2008](https://www.bio.purdue.edu/People/faculty/lucas/2008.Henry_and_Lucas.ANBEHAV.pdf); [Cordon-bleu audiogram](https://labs.sonicfield.org/library/hearing-and-vocalizations-in-a-small-songbird-the-red-cheeked-cordon-bleu-iuraeg)) |

---

## 5. Build vs generate: should we synthesize masteran audio?

The question was whether to build a **song generator** or use **existing recordings**.

**Decision: use real recordings for training material, and generate the *training program*, not the audio.**

| Option | Evidence | Verdict |
|---|---|---|
| Neural audio generator (WaveGAN, neural vocoders) | Neural vocoders **struggle with pitch and voicing** on birdsong. WaveGAN canary songs have been analysed in the lab and used in art, but there is **no playback evidence** that birds learn from or respond to them. ([Neural vocoder study](https://paperswithcode.com/paper/an-initial-study-on-birdsong-re-synthesis); [canary WaveGAN thesis](https://www.labri.fr/en/agenda/silvia-pagliarini-phd-thesis-modeling-neural-network-responsible-song-learning-songbirds-16h)) | ❌ **Risky.** Birds copy what they hear, *including artifacts*. A juvenile that learns a glitchy phrase during its sensitive window can't be "un-trained". |
| Physics-based synthesis | Wild rufous-collared sparrows responded to synthetic songs as strongly as to real ones. ([Physics World](https://physicsworld.com/a/wild-songbirds-respond-to-mathematically-synthesized-song/); [Frontiers 2021](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8287859/)) | ⏸️ Promising but needs per-species modelling. Revisit for research partnerships. |
| **Real recordings + generated program** | Hobbyists already own and value authentic isian (cililin, ciblek, cucak jenggot). xeno-canto offers CC-licensed recordings via API v3 (key required since Oct 2025; **licence varies per recording**, and *ND* licences forbid trimming). ([xeno-canto terms](https://xeno-canto.org/about/terms)) | ✅ **MVP choice.** Users import their own masteran files. The app *generates* each session: order, natural gaps, level variation, fades and rotation. v2 adds a licence-checked xeno-canto catalogue. |

The repo contains a small **synthetic chirp generator**, but it is used *only* for automated tests and the in-app "demo data" so testers can try Feature 2 without a bird. It is clearly labelled and never offered as training material.

---

## 6. Ethics and welfare guardrails (R13)

* The bird trade is driving the **Asian Songbird Crisis**. Some species have more individuals in Indonesian households than in the wild. Researchers recommend steering hobbyists to **captive-bred, ringed ("ring class") birds** and supporting legitimate breeding. ([Chester Zoo](https://www.chesterzoo.org/news/asian-songbird-crisis-more-birds-could-be-in-indonesian-households-than-in-the-wild/); [BirdLife case study](https://datazone.birdlife.org/sowb/casestudy/developing-a-market-based-solution-to-the-bird-trade-in-indonesia); [TRAFFIC strategy](https://www.traffic.org/site/assets/files/2275/conservation-strategy-for-southeast-asian-songbirds-in-trade.pdf); [Mongabay on captive breeding](https://news.mongabay.com/2018/12/is-captive-breeding-the-answer-to-indonesias-songbird-crisis/))
* Vietnamese chào mào are mostly **wild-caught** because they breed poorly in captivity (TRAFFIC). That is a reason to launch where captive breeding is established (murai batu, kenari, lovebird in Indonesia) before expanding.
* **Product stance:**
  1. Bird profiles carry an **origin field (captive-bred + ring number / wild / unknown)**. The breeder report (v2) only certifies ringed birds.
  2. The app never sells, lists or helps locate birds.
  3. Welfare defaults: daily cap, session limit, gentle fades, low night volume, and a stress-signs checklist.
  4. All audio and data stay on the device by default.

---

## 7. Open questions to resolve through user testing

1. Will contestants trust a score, or only their own ears? **Calibration with expert listeners is the critical risk** (see the test plan).
2. Is a phone left on a charger beside the cage an acceptable "masteran device"? Many owners already use a phone or a cheap speaker, so this is likely.
3. Does variable, scheduled playback measurably beat looping? This needs a 4–8 week cohort, so the MVP collects the data now.
4. Which species should be first-class? Proposed: **murai batu, kenari, lovebird, cucak ijo, kacer, pleci**, plus "other".
