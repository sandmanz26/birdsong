# Riset cakupan jenis & kapasitas data (v0.4)

*November 2026. Melanjutkan [06-curation-standard.md](06-curation-standard.md). Tabel kapasitas di §4 dihasilkan otomatis dari `review/candidates/COVERAGE.md`.*

## 1. Ringkasan

| | v0.3 | v0.4 |
|---|---|---|
| Jenis burung target (bisa dipilih pemilik) | 8 (hard-coded) | **25** (registri data) |
| Sumber isian | 11 | **21** |
| Total jenis dalam registri | 18 | **36** |
| Sumber rekaman | Commons (+ xeno-canto dengan key) | **iNaturalist (tanpa key)** + Commons + xeno-canto |
| Klip per jenis | 1 | **hingga 4**, total ≥ 45 dtk |
| Paket | 9 ditulis tangan | **1 paket dasar per jenis target, dibuat otomatis** + paket lintas jenis |
| Cek taksonomi | – | **GBIF Backbone** (T1) |
| Deteksi duplikat | – | nomor XC + **penjajaran amplop waktu** |
| Jalur lisensi NC | ditolak | **daftar permohonan izin tertulis** |
| Cek kualitas rekaman pengguna | – | **gerbang kualitas** (pendek, clipping, bising, tanpa kicau) |

Menambah jenis kini cukup dengan mengubah data (`content/species.json`), tanpa mengubah kode.

## 2. Riset: jenis apa yang perlu dicakup

**Kelas lomba.** Kelas lomba berbeda per penyelenggara, tetapi jenis intinya konsisten: murai batu, kacer, cucak ijo, kenari, lovebird, cendet, anis merah, kapas tembak, cucak rowo dan panca warna, ditambah pleci dan kolibri di banyak event. Lihat [Antara](https://www.antaranews.com/berita/207676/eh-ada-lomba-kicau-burung-tingkat-nasional), [Kominfo Jatim](https://kominfo.jatimprov.go.id/berita/lomba-burung-wujud-nyata-pelestarian-lingkungan-dan-sumber-daya-hayati), [RRI](https://rri.co.id/bengkulu/hobi/2506465/mengulas-sepuluhjenis-burung-kicau-primadona-arena-lomba-di-indonesia), [IDN Times](https://www.idntimes.com/science/discovery/burung-kicau-yang-kerap-digunakan-lomba-00-h7csw-nkcdnb), [Tribun Sumsel](https://sumsel.tribunnews.com/sumsel/1020488/daftar-htm-dan-cara-mendaftar-lomba-burung-kicau-yang-digelar-di-polres-prabumulih) dan [KMI](https://kreasimudaindonesia.com/jadwal-lomba-burung-2025-saatnya-peliharaan-kecintaan-adu-kicau/). PBI mewajibkan kelas utama seperti murai batu memakai burung tangkaran ber-ring resmi ([Kominfo Jatim](https://kominfo.jatimprov.go.id/berita/lomba-burung-wujud-nyata-pelestarian-lingkungan-dan-sumber-daya-hayati)).

**Perdagangan.** Survei 280 kunjungan di 25 pasar Jawa–Bali (2014–2020) menempatkan perkutut dan murai batu di antara jenis teratas ([ResearchGate](https://www.researchgate.net/publication/379725922_Comparisons_of_songbirds_on_sale_across_online_and_physical_markets_in_Indonesia)). Jalak suren dan cucak-cucakan (*Garrulax*, hwamei) juga banyak diperdagangkan ([MDPI Diversity 2021](https://www.mdpi.com/1424-2818/13/6/238), [Wikipedia: Garrulax](https://en.wikipedia.org/wiki/Garrulax)).

**Regional.** Chào mào (cucak jambul merah) di Vietnam; perkutut/merbok dan kacer di Malaysia dan Thailand ([Dialogue Earth](https://dialogue.earth/en/nature/malaysias-booming-songbird-competition-scene-could-silence-its-forests/), [Macaranga](https://www.macaranga.org/ingrained-in-cuture-songbird-competitions-reign/)).

**Status hukum (informasi, bukan nasihat hukum).**

| Status | Jenis |
|---|---|
| Dikeluarkan dari daftar dilindungi pada 2018 (P.92/P.106) | Murai batu, jalak suren, cucak rawa ([CNN Indonesia](https://www.cnnindonesia.com/nasional/20180906141940-20-328180/murai-jalak-dan-cucak-rowo-bukan-lagi-satwa-dilindungi), [Mongabay](https://mongabay.co.id/2018/09/14/tiga-jenis-burung-hendak-dikeluarkan-dari-daftar-satwa-dilindungi-berikut-penjelasan-klhk/)) |
| Dilindungi, wajib izin | Cucak ijo ([Ayo Semarang](https://www.ayosemarang.com/semarang-raya/pr-77795089/Cucak-Ijo-Masuk-Hewan-Dilindungi-Wajib-Punya-Izin-Pemeliharaan), [Kumparan](https://kumparan.com/seputar-hobi/apakah-cucak-ijo-dilindungi-inilah-penjelasan-selengkapnya-24hr2I9Sicy)). Sumber-sumber berbeda pendapat soal jenis *Chloropsis* mana saja yang termasuk, jadi kurator harus memastikan per rekaman. |
| Dilaporkan wajib izin | Kolibri ninja (sumber yang sama). Status diberi tanda "cek ke BKSDA". |

Aplikasi menampilkan status ini beserta sumbernya saat pemilik memilih jenis. Ini informasi, bukan nasihat hukum.

**Catatan konservasi.** Jalak suren Jawa sudah punah di alam ([MDPI Diversity 2021](https://www.mdpi.com/1424-2818/13/6/238)). Cucak rawa berstatus kritis. Untuk keduanya aplikasi menegaskan: hanya burung tangkaran.

**Taksonomi.** 35 dari 36 nama ilmiah berstatus *ACCEPTED* di GBIF Backbone. Pengecualiannya: GBIF masih menganggap *Gracupica jalla* (jalak suren Jawa) sinonim *G. contra*. Ini tercatat eksplisit di registri (`gbifSynonymOf`), dan pencarian dibatasi ke Indonesia supaya rekaman jalak suren India atau Thailand, yang jenis dan suaranya berbeda, tidak ikut masuk. Burung Indonesia memakai daftar HBW/BirdLife; AviList (2025) menyatukan daftar global ([GNFI](https://www.goodnewsfromindonesia.id/2026/04/03/kekayaan-burung-indonesia-2026-538-spesies-endemis-tersebar-dari-sulawesi-hingga-kalimantan)).

## 3. Sumber rekaman: temuan kapasitas

| Sumber | Akses | Kekuatan | Keterbatasan |
|---|---|---|---|
| **iNaturalist** | API terbuka, tanpa key | Identifikasi diverifikasi komunitas (*research grade*), lisensi per suara | Rekaman dari Indonesia sangat sedikit; banyak rekaman HP pendek; mayoritas berlisensi NC |
| **xeno-canto** | API v3, butuh key gratis | Arsip terkaya untuk Asia Tenggara, ada nilai kualitas A–E | Tanpa key tidak bisa diakses (kumpulan xeno-canto di GBIF kosong untuk jenis ini) |
| **Wikimedia Commons** | Terbuka | Lisensi bersih | Sangat jarang untuk jenis Asia Tenggara |

**Lisensi adalah hambatan utama, bukan jumlah rekaman.** Sampel dari iNaturalist (research grade, ada suara):

| Jenis | Lisensi komersial | NC (bisa minta izin) |
|---|---|---|
| Murai batu | 75 | 359 |
| Cendet | 4 | 33 |
| Branjangan | 0 | 8 |
| Ciblek | 1 | 6 |
| Cucak jenggot | 0 | 0 |

Karena itu pipeline kini menghasilkan `PERMISSIONS.md`, yaitu daftar rekaman NC terbaik per jenis lengkap dengan perekam dan tautannya, untuk dimintai **izin tertulis**. Rekaman NC tidak diunduh dan tidak diproses sebelum izin tercatat di `content/curation.json → permissions`.

## 4. Kapasitas saat ini (build 2026-11-02, iNaturalist + Commons, tanpa key xeno-canto)

**291 klip diproses untuk 36 jenis.** Ringkasan:

| Status | Jumlah | Jenis |
|---|---|---|
| ✅ Siap direview ahli (≥ 45 dtk lolos cek otomatis) | **22** | Murai batu, Kacer, Cucak ijo, Kenari, Cucak rawa, Jalak suren, Anis merah, Cendet, Cucak kutilang, Cucak jambul merah (chào mào), Poksai mandarin, Hwamei (wambi), Gelatik batu, Perkutut, Cipoh, Kepodang, Gereja (tarung), Belibis, Tengkek buto, Prenjak, Srigunting, Cinenen |
| 🟡 Butuh materi tambahan | 5 | Lovebird, Sanger, Cililin, Ciblek, Trucukan |
| 🟠 Hanya lewat izin (ada rekaman NC) | 5 | Pleci, Branjangan, Kapas tembak, Decu, Blackthroat |
| ⛔ Belum ada sumber sama sekali | 4 | Anis kembang, Kolibri ninja, Cucak jenggot, Tledekan |

Perkembangan kapasitas jenis yang siap direview:

| Versi | Jenis siap |
|---|---|
| v0.3 (Commons saja) | 2 |
| v0.4 build pertama | 15 |
| v0.4 setelah perbaikan pipeline dan standar v2 | **22** |

Daftar permohonan izin berisi **264 rekaman NC terbaik** (maksimal 10 per jenis) di `review/candidates/PERMISSIONS.md`.

**Catatan wilayah.** Banyak materi yang lolos berasal dari luar wilayah yang disukai, misalnya murai dari Taiwan, India atau Thailand. Ini tidak otomatis ditolak (M3 bisa diterima ahli lewat H5), tetapi untuk jenis lomba seperti murai, ahli kemungkinan besar akan menolaknya karena dialeknya berbeda. Kolom terakhir di bawah menunjukkan berapa detik yang berasal dari wilayah yang disukai.

| Jenis | Peran | Ditemukan | Lisensi OK | NC (izin) | Klip lolos | Detik lolos | …dari wilayah disukai |
|---|---|---|---|---|---|---|---|
| Murai batu | target + isian | 105 | 18 | 87 | 6 | 131 s | 12 s |
| Kacer | target + isian | 118 | 32 | 86 | 6 | 125 s | 60 s |
| Cucak ijo | target | 2 | 2 | 0 | 2 | 65 s | 65 s |
| Kenari | target + isian | 66 | 16 | 50 | 5 | 166 s | 166 s |
| Lovebird | target | 6 | 2 | 4 | 1 | 21 s | 21 s |
| Pleci | target + isian | 27 | 6 | 21 | 0 | 0 s | 0 s |
| Cucak rawa | target | 65 | 17 | 48 | 3 | 52 s | 0 s |
| Jalak suren | target | 1 | 1 | 0 | 1 | 48 s | 48 s |
| Anis merah | target | 14 | 11 | 3 | 6 | 303 s | 0 s |
| Anis kembang | target | 0 | 0 | 0 | 0 | 0 s | 0 s |
| Cendet | target + isian | 41 | 4 | 37 | 1 | 50 s | 0 s |
| Branjangan | target | 17 | 0 | 17 | 0 | 0 s | 0 s |
| Kolibri ninja | target | 0 | 0 | 0 | 0 | 0 s | 0 s |
| Kapas tembak | target + isian | 6 | 0 | 6 | 0 | 0 s | 0 s |
| Cucak kutilang | target | 35 | 3 | 32 | 2 | 85 s | 85 s |
| Cucak jambul merah (chào mào) | target | 113 | 32 | 81 | 5 | 142 s | 22 s |
| Poksai mandarin | target | 107 | 18 | 89 | 6 | 138 s | 138 s |
| Hwamei (wambi) | target | 110 | 23 | 87 | 6 | 154 s | 154 s |
| Decu | target | 29 | 4 | 25 | 0 | 0 s | 0 s |
| Gelatik batu | target | 108 | 21 | 86 | 6 | 186 s | 0 s |
| Perkutut | target | 114 | 17 | 97 | 6 | 129 s | 38 s |
| Sanger | target + isian | 28 | 9 | 19 | 2 | 33 s | 33 s |
| Blackthroat | target + isian | 2 | 0 | 2 | 0 | 0 s | 0 s |
| Cipoh | target + isian | 111 | 29 | 82 | 6 | 141 s | 132 s |
| Kepodang | target + isian | 107 | 18 | 88 | 6 | 186 s | 136 s |
| Cililin | isian | 7 | 4 | 3 | 1 | 19 s | 19 s |
| Cucak jenggot | isian | 0 | 0 | 0 | 0 | 0 s | 0 s |
| Ciblek | isian | 7 | 1 | 6 | 1 | 25 s | 25 s |
| Tledekan | isian | 0 | 0 | 0 | 0 | 0 s | 0 s |
| Gereja (tarung) | isian | 111 | 18 | 93 | 4 | 48 s | 0 s |
| Belibis | isian | 22 | 11 | 11 | 5 | 93 s | 0 s |
| Tengkek buto | isian | 94 | 20 | 74 | 6 | 125 s | 125 s |
| Trucukan | isian | 103 | 19 | 84 | 3 | 36 s | 24 s |
| Prenjak | isian | 111 | 22 | 89 | 6 | 103 s | 32 s |
| Srigunting | isian | 30 | 18 | 12 | 6 | 151 s | 123 s |
| Cinenen | isian | 115 | 28 | 87 | 5 | 167 s | 14 s |

### Tiga tuas untuk menutup celah
1. **API key xeno-canto** (gratis). Untuk Indonesia, xeno-canto jauh lebih kaya daripada iNaturalist, termasuk untuk cililin, cucak jenggot, tledekan dan dialek murai Sumatra. Ini tuas terbesar untuk jenis-jenis inti lomba.
2. **Permohonan izin tertulis** ke perekam yang ada di `PERMISSIONS.md`. Setiap izin cukup dicatat di `content/curation.json → permissions`, lalu build diulang.
3. **Rekaman mitra** (penangkar, klub, juri) untuk dialek dan jenis yang tidak ada di arsip mana pun: anis kembang, kolibri ninja, cucak jenggot, tledekan.

## 5. Perbaikan fungsional (v0.4)

| Area | Masalah sebelumnya | Perbaikan | Bukti |
|---|---|---|---|
| **Gerbang kualitas rekaman** | Rekaman pendek, bising, clipping atau tanpa kicauan tetap diberi vonis, sehingga "Belum" yang muncul bisa salah | `assessRecording()` memeriksa durasi < 20 dtk, clipping > 0,1%, tidak ada frasa, kerja < 5% dan SNR < 15 dB. Hasil berisiko ditandai `reliability: low`, dan pengguna diberi panduan perbaikan yang konkret | Unit test: rekaman normal OK; pendek, sunyi dan clipping terdeteksi |
| **Template isian disimpan** | Setiap Cek Isian men-*decode* ulang semua track tutor (cache hanya 6), sehingga lambat dan boros memori di HP saat paket berisi puluhan klip | Template dihitung **sekali saat paket dipasang** lalu disimpan di IndexedDB (sekitar 16 KB per isian) | Cek Isian tidak lagi men-*decode* audio tutor |
| **Target terfokus** | Semua penanda isian di semua klip menjadi target | Default maksimal 2 isian per jenis, sesuai urutan kurator | – |
| **Deteksi duplikat** | Rekaman yang sama bisa muncul dua kali (misalnya xeno-canto yang di-*mirror* ke Commons) | Dedup berdasarkan nomor XC, lalu **penjajaran amplop energi** dalam waktu. Sidik jari spektral saja terbukti terlalu kasar: pasangan duplikat asli hanya 0,985, hampir sama dengan pasangan berbeda (0,979) | Data nyata: duplikat asli 0,978 vs non-duplikat tertinggi 0,60 (ambang 0,9) |
| **Cek taksonomi (T1)** | Nama ilmiah tidak diverifikasi | GBIF Backbone + pencocokan taksa sumber (subspesies diterima, jenis lain ditolak). Sinonim yang berbeda harus didokumentasikan | 35/36 ACCEPTED; jalak suren didokumentasikan |
| **Ukuran unduhan** | 96 kbps × banyak klip, berat untuk kuota HP | Transcode ke 64 kbps mono saat publish; maksimal 6 klip / 240 dtk per jenis; ukuran ditampilkan sebelum unduh | Terukur: paket murai 7 jenis, 33 klip, 12:43 menit = **6,1 MB** |
| **Pemilih jenis** | Dropdown 8 jenis | Pencarian berdasarkan nama, nama latin dan sebutan lokal ("pentet" → Cendet, "konin" → Kolibri ninja), plus peringatan hukum dan konservasi | E2E + unit test |
