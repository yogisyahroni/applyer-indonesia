# Applyer Indonesia

Applyer Indonesia adalah distribusi Indonesia-first dari [xCirno1/applyer](https://github.com/xCirno1/applyer), tetap menggunakan lisensi MIT dan mempertahankan human review sebelum aplikasi kerja dikirim.

## Fokus MVP

- JobStreet Indonesia sebagai source pencarian first-class.
- LinkedIn dan Indeed tetap menggunakan integrasi upstream.
- Greenhouse, Lever, Ashby, dan Workday tetap tersedia melalui tracked company boards.
- `search_jobs` melalui MCP default ke `indonesiaOnly: true`.
- Lokasi pencarian default adalah `Indonesia`; kota/provinsi spesifik tetap dapat diberikan.
- Hasil non-Indonesia dibuang saat strict Indonesia filtering aktif.
- Profil mendukung nilai gaji IDR yang realistis (batas validasi dinaikkan menjadi 10 miliar unit mata uang).
- Bahasa Indonesia upstream tetap tersedia.
- Windows tetap memakai target installer NSIS; CI fork ini juga memverifikasi build/test di Windows.

## Status JobStreet

| Kemampuan | Status MVP |
| --- | --- |
| Keyword search | ✅ Dedicated scraper |
| Lokasi Indonesia | ✅ Default/strict filtering |
| Job detail | ✅ Dedicated scraper |
| Salary text | ✅ Dibaca jika tersedia |
| Queue & indexed jobs | ✅ Menggunakan pipeline Applyer |
| Generic form fill | 🟡 Menggunakan form-filler Applyer; login/custom question tetap butuh review |
| Auto-submit | ❌ Sengaja tidak didukung |

> Job board adalah target bergerak. Perubahan DOM JobStreet dapat memerlukan pembaruan selector. Scraper dibuat dengan beberapa selector fallback, tetapi bukan jaminan bahwa website pihak ketiga tidak akan berubah.

## Menjalankan dari source

Prasyarat mengikuti upstream Applyer: Node.js 20.19+ atau 22.12+.

```bash
npm install
npm run dev
```

Verifikasi lokal:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Build installer Windows:

```bash
npm run package -- --win
```

## Perilaku MCP Indonesia

Tanpa override, agent menerima default berikut:

```text
location: Indonesia
indonesiaOnly: true
sources:
  - jobstreet
  - indeed
  - linkedin
  - greenhouse
  - lever
  - ashby
  - workday
```

Jika pengguna secara eksplisit meminta pencarian di luar Indonesia, agent dapat mengirim `indonesiaOnly: false` beserta lokasi yang diminta.

## Safety / human-in-the-loop

Sama seperti upstream Applyer, `fill_application` hanya mengisi form. Tombol submit tetap milik pengguna. Pertanyaan custom, eligibility, login, dan verification challenge tidak boleh dijawab secara spekulatif oleh agent.

## Attribution

Project ini diturunkan dari `xCirno1/applyer`. Copyright dan MIT License upstream tetap dipertahankan di `LICENSE`.
