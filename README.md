# Game Translate HTML

Aplikasi web khusus menerjemahkan **game HTML** (Twine, SugarCube, Harlowe)
ke Bahasa Indonesia. Satu file, satu alur: upload file HTML → scan →
terjemahkan → download file hasil `-ID.html`.

## Fitur

- **Deteksi mesin otomatis** — SugarCube / Harlowe langsung tampil dengan
  versinya, misalnya `SugarCube 2.36.1`; cara ekstraksi menyesuaikan mesin.
- **Parser JavaScript beneran (acorn)** — string di dalam `<script>`,
  termasuk kode yang sudah diminify dan template literal, ikut ketemu.
- **Write-back akurat per byte** — file hasil byte-identik dengan aslinya
  kecuali string yang diterjemahkan.
- **Auto backup `.orig` + tombol Pulihkan** setiap kali Timpa.
- **Verifikasi file hasil** — cek struktur dan macro sebelum download.
- **Glossary, perlindungan placeholder/macro, Translation Memory, Daftar
  Teks, skip-passage, ekstraksi `<script>` (opt-in), stop/resume +
  autosave.**
- **QA per teks, Cek Hasil + repair, laporan teks belum diterjemahkan.**
- **Mode Sederhana**, preview game hasil, statistik, ekspor `.po` / TMX.

## Mesin terjemah

Urutan: provider custom (OpenAI-compatible — default FreeLLMAPI
`localhost:3001/v1`) → Google → Edge → MyMemory. Pengaturan provider
tersimpan di browser (localStorage), sama seperti aplikasi Game Translate
Gabungan.

## Pakai

Buka https://ilhamnurdin99.github.io/game-translate-html/ — tidak perlu
instal apa-apa. File game tidak dikirim ke mana-mana kecuali ke mesin
terjemah yang dipilih.

## Lisensi

Untuk pemakaian pribadi. Game hasil terjemahan hanya untuk dimainkan
sendiri, bukan untuk dipublikasikan ulang.
