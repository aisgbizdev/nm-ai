# NM Ai Risk Planner Template

## 📘 Deskripsi
Template ini digunakan oleh NM Ai untuk menghitung dan menjelaskan aspek risiko trading berdasarkan data `Trading Rules SPA.xlsx`.
Dapat digunakan untuk edukasi dan simulasi non-investasi.

## ⚙️ Input Utama
- Produk (Trade Code)
- Harga pasar (indicative)
- Lot size
- Margin requirement (%)
- Leverage
- Modal awal (Equity)
- Floating P/L (opsional)

## 💡 Output
- Margin used
- Free margin
- Margin call level (70% default)
- Equity ratio
- Dana tahan floating loss
- Estimasi top-up margin bila diperlukan

## 🧮 Rumus Dasar
```
Margin Used = (Contract Size × Harga × Lot) / Leverage
Equity = Balance + Floating P/L
Free Margin = Equity - Margin Used
Equity Ratio = (Equity / Margin Used) × 100%
Margin Call Trigger = 70% × Initial Margin
```

## 🧭 Catatan
- Semua perhitungan bersifat edukatif.
- Tidak menggambarkan kondisi pasar aktual.
- Berdasarkan aturan SPA dan dokumen 'Trading Rules NM Standard'.
