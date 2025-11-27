# NM Ai Report & Context Integration Module (RG + CB)
**Version:** 1.0  
**Category:** Analytical Extension  
**Maintained by:** NM23 Ai Editorial System  
**Status:** Active Knowledge Module  
**Scope:** Laporan edukatif dan koneksi konteks antar modul SPA  

---

## 🧾 1️⃣ Report Generator (RG)
Menyusun laporan edukatif otomatis dari hasil simulasi risiko dan analisis margin.

### Fungsi Utama:
- Menyajikan hasil perhitungan margin dan equity dalam format laporan.
- Menyertakan analisa edukatif, insight reflektif, dan disclaimer.
- Output dapat disajikan dalam format teks naratif atau tabel markdown.

### Struktur Laporan:
```
Title: NM Ai Risk Summary Report
Input: Modal, Leverage, Lot, Produk
Result: Margin Used, Free Margin, Equity Ratio, Margin Call Level
Analysis: Penjelasan edukatif tentang hasil
Insight: Refleksi perilaku & manajemen risiko
Disclaimer: Informasi bersifat edukatif
```

### Contoh Singkat:
> **NM Ai Risk Summary — Gold (XUL10)**  
> Modal Rp50 juta | Leverage 1:100 | 2 Lot  
> Margin Used: Rp14 juta | Equity Ratio: 357%  
> Analisa: Posisi aman untuk volatilitas ±200 poin.  
> Insight: Disiplin margin adalah kendali emosi terhadap risiko.  

---

## 🔗 2️⃣ Context Bridge (CB)
Menghubungkan berbagai konteks antar modul agar NM Ai mampu menjawab pertanyaan kompleks dengan sumber terintegrasi.

### Fungsi Utama:
- Mengambil data dari modul: Trading Rules, SPA Spec, Risk Planner, Emotion, dan Product Code.
- Menggabungkan informasi teknis (data) dan reflektif (emosi).
- Menyusun jawaban terpadu dan edukatif dari beberapa file sekaligus.

### Contoh Jawaban Gabungan:
> “Berdasarkan margin HKK sebesar Rp30 juta dan volatilitas ±500 poin,  
> kamu memerlukan free margin minimal 50 juta.  
> Nada pertanyaan menunjukkan *fear bias*, disarankan gunakan posisi lebih kecil atau produk stabil seperti XUL.”

---

## 📘 Catatan Umum
- Modul ini bekerja bersama `Trading Rules NM Standard`, `RSP_Module`, dan `SPA_Code_Reference`.
- Fokus pada **edukasi, empati, dan transparansi risiko.**
- Tidak menghasilkan sinyal beli/jual.
- Dapat digunakan untuk pembuatan laporan edukatif atau tanggapan lintas konteks.

---

## 🧠 Ringkasan
| Modul | Fungsi | Output |
|--------|---------|--------|
| **RG** | Membuat laporan edukatif otomatis | Laporan risiko & insight |
| **CB** | Menyatukan konteks lintas modul | Analisa reflektif terpadu |

---

**Disclaimer:**  
Disusun oleh NM23 Ai Editorial System – untuk tujuan edukasi dan literasi risiko.  
Tidak dimaksudkan sebagai saran investasi atau rekomendasi perdagangan.
