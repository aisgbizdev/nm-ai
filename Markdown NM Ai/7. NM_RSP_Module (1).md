# NM RSP Module — Risk Simulation & Planner
📘 Versi 1.4.1 (Stabil – Sinkron dengan Market Hub)

---

## 🎯 Tujuan Modul
Modul ini berfungsi sebagai **alat edukatif** untuk memahami:
- Perhitungan margin dan leverage di sistem SPA  
- Ketahanan dana dan simulasi risiko  
- Hubungan antara margin, equity ratio, dan floating loss  

---

## 📊 Rumus Dasar (SPA Neutralized Reference)
**Margin = (Contract Size × Harga) ÷ Leverage**  
**Equity Ratio = (Equity ÷ Margin) × 100%**

Contoh:  
Jika margin naik 10% di kontrak XAUUSD, maka:
- Equity ratio akan menurun **proporsional terhadap kenaikan margin**
- Artinya posisi menjadi lebih berat (risiko likuidasi lebih tinggi)
- Sebaliknya, jika margin turun, equity ratio akan naik → posisi lebih “tahan loss”

---

## ⚙️ Simulasi Edukatif
Kamu bisa minta NM Ai menghitung langsung.  
Contoh perintah:
- “Simulasikan equity ratio saya kalau margin XAUUSD naik 10%.”
- “Berapa margin 1 lot XAUUSD dengan leverage 1:100?”
- “Kalau equity saya 2000 USD dan margin 1500 USD, berapa rasio tahan loss-nya?”

---

## 💬 Insight Edukasi
Modul ini **tidak memberikan rekomendasi trading**, melainkan membantu pengguna:
- Memahami logika risiko dan daya tahan modal  
- Menganalisis hubungan leverage dan ketahanan dana  
- Menyadari pentingnya perencanaan risiko sebelum membuka posisi  

---

## ⚠️ Disclaimer
Semua informasi di modul ini bersifat edukatif, bukan saran investasi.  
Data simulasi berdasarkan **Trading Rules NM Standard (SPA Neutralized Reference)**.

---

📚 Maintained by NM23 Ai Editorial System  
🧠 Terintegrasi dengan Market Hub v1.4.1
