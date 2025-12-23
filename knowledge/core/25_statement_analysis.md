# Analisis Statement Trading

## Definisi Metrik Statement

### Account Status
- **Previous Balance**: Saldo awal sebelum transaksi hari ini
- **New Balance**: Saldo setelah semua transaksi settled
- **Margin In/Out**: Dana masuk/keluar (deposit/withdrawal)
- **Floating P/L**: Profit/Loss dari posisi yang masih terbuka
- **Equity**: New Balance + Floating P/L (nilai riil akun saat ini)
- **Margin Required**: Margin yang digunakan untuk posisi terbuka
- **Effective Margin (Free Margin)**: Equity - Margin Required
- **Equity Ratio (Margin Level)**: (Equity / Margin Required) x 100%

### Status Kesehatan Akun
| Margin Level | Status | Risiko |
|--------------|--------|--------|
| > 500% | Sangat Sehat | Rendah |
| 300% - 500% | Sehat | Rendah-Sedang |
| 200% - 300% | Waspada | Sedang |
| 100% - 200% | Bahaya | Tinggi |
| < 100% | Margin Call | Sangat Tinggi |

### Call Margin Price
- Harga dimana akun mencapai Margin Call (Equity = Margin Required)
- Jika mendekati harga saat ini, risiko sangat tinggi

### Auto Liquidation Price
- Harga dimana posisi akan dilikuidasi otomatis
- Biasanya saat Equity < 50% dari Margin Required

## Trading Plan 3 Level

### Level 1: MINIMALIS (Konservatif)
**Filosofi**: Jaga modal, hindari risiko, prioritaskan keamanan

**Kriteria Akun Saat Ini**:
- Margin Level < 300%: URGENT - tutup sebagian posisi
- Margin Level 300-500%: HOLD - jangan tambah posisi baru
- Margin Level > 500%: AMAN - boleh buka posisi kecil

**Aksi yang Disarankan**:
- Jika ada floating loss > 30% equity: Cut loss bertahap
- Jika ada floating profit: Pertimbangkan take profit sebagian
- Target profit: 3-5% per bulan
- Max drawdown toleransi: 10%

**Top Up Suggestion**:
- Jika Margin Level < 200%: Top up untuk mencapai 300%
- Formula: Top Up = (Margin Required x 3) - Equity

### Level 2: SEDANG (Moderat)
**Filosofi**: Balance antara growth dan protection

**Kriteria Akun Saat Ini**:
- Margin Level < 200%: URGENT - top up atau cut loss
- Margin Level 200-400%: MODERATE - bisa swing trade
- Margin Level > 400%: AGRESIF - bisa scalping/day trade

**Aksi yang Disarankan**:
- Jika ada floating loss > 20% equity: Partial close atau hedging
- Jika ada floating profit: Lock profit dengan trailing stop
- Target profit: 5-10% per bulan
- Max drawdown toleransi: 20%

**Top Up Suggestion**:
- Jika Margin Level < 300%: Top up untuk mencapai 400%
- Formula: Top Up = (Margin Required x 4) - Equity

### Level 3: MAKSIMAL (Agresif)
**Filosofi**: Maksimalkan opportunity dengan risiko terukur

**Kriteria Akun Saat Ini**:
- Margin Level < 300%: WARNING - terlalu agresif, rebalance
- Margin Level 300-500%: AKTIF - bisa multi-position
- Margin Level > 500%: FULL POWER - gunakan leverage maksimal

**Aksi yang Disarankan**:
- Jika ada floating loss: Average down jika trend masih valid
- Jika ada floating profit: Pyramid up untuk maksimalkan gain
- Target profit: 10-20% per bulan
- Max drawdown toleransi: 30%

**Top Up Suggestion**:
- Jika Margin Level < 400%: Top up untuk mencapai 500%
- Formula: Top Up = (Margin Required x 5) - Equity

## Perhitungan Risiko

### Worst Case Scenario
- Per 1 lot XUL10 (Gold): Pergerakan $100 = $10,000 P/L
- Per 0.1 lot XUL10: Pergerakan $100 = $1,000 P/L
- Estimasi volatilitas harian: $20-50

### Kalkulasi Potensi
```
Potensi Profit = Lot Size x Point Value x Target Pips
Potensi Loss = Lot Size x Point Value x Stop Loss Pips
Risk Reward Ratio = Potensi Profit / Potensi Loss
```

### Safety Check
1. Jangan gunakan > 50% effective margin untuk 1 posisi
2. Jangan biarkan floating loss > 30% equity
3. Selalu sisakan buffer untuk volatilitas

## Format Output Analisis

### Template Respons
```
## 📊 ANALISIS STATEMENT TRADING

### Ringkasan Akun
- Balance: [amount]
- Equity: [amount]
- Margin Level: [percentage]%
- Status: [Sehat/Waspada/Bahaya]

### Open Positions
[List posisi terbuka jika ada]

### Settled Today
[Ringkasan transaksi hari ini]

---

## 🎯 REKOMENDASI TRADING PLAN

### 📗 Plan MINIMALIS (Konservatif)
**Aksi**: [Hold/Cut Loss/Take Profit]
**Top Up**: Rp [amount] untuk margin level [target]%
**Potensi Profit**: [range]
**Risiko Terburuk**: [worst case]

### 📙 Plan SEDANG (Moderat)  
**Aksi**: [Rekomendasi]
**Top Up**: Rp [amount] untuk margin level [target]%
**Potensi Profit**: [range]
**Risiko Terburuk**: [worst case]

### 📕 Plan MAKSIMAL (Agresif)
**Aksi**: [Rekomendasi]
**Top Up**: Rp [amount] untuk margin level [target]%
**Potensi Profit**: [range]
**Risiko Terburuk**: [worst case]

---

⚠️ **Disclaimer**: Analisis ini bersifat edukatif. Keputusan trading adalah tanggung jawab Anda.
```

## Deteksi Jenis Statement

### Ciri Statement Trading:
- Kata kunci: "Balance", "Equity", "Margin", "Floating", "Statement"
- Tabel dengan kolom: Item, Unit, Buy/Sell Price, Profit/Loss
- Header: "Account Summary", "Daily Statement", "Temporary Statement"
- Nomor akun format: RFNM####

### Ciri Chart Trading:
- Candlestick atau line chart
- Sumbu harga (vertikal) dan waktu (horizontal)
- Indikator teknikal (MA, RSI, dll)
- Tidak ada tabel statement
