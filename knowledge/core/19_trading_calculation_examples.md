# Contoh Perhitungan Trading SPA

## PENTING: RUMUS MARGIN SPA (BUKAN LEVERAGE)

**JANGAN GUNAKAN RUMUS LEVERAGE!** SPA menggunakan FIXED MARGIN per lot.

### Rumus yang SALAH (JANGAN DIGUNAKAN):
```
SALAH: Margin = Contract Size × Harga / Leverage  ❌
SALAH: Margin = 100 oz × $2650 / 100 = $2,650    ❌
SALAH: Margin per lot berubah sesuai harga        ❌
```

### Rumus yang BENAR (SPA Trading Rules):
```
BENAR: Initial Margin = $1,000 per lot (Day Trade)    ✓
BENAR: Initial Margin = $2,000 per lot (Overnight)    ✓
BENAR: Margin per lot TETAP, tidak tergantung harga   ✓
```

## FORMULA POSITION SIZING (PATOKAN DASAR)

### Kapasitas Lot Maksimal
```
Kapasitas Max = Dana ÷ $1,000 (day trade)
Kapasitas Max = Dana ÷ $2,000 (overnight)
```

### Rekomendasi Lot Berdasarkan Risk Profile
| Dana (USD) | Max Lot | IDEAL (Low Risk) | MEDIUM Risk | HIGH Risk |
|------------|---------|------------------|-------------|-----------|
| $5,000 | 5 lot | 1 lot (20%) | 2 lot (40%) | 3 lot (60%) |
| $10,000 | 10 lot | **1-2 lot (10-20%)** | **3-4 lot (30-40%)** | 5 lot (50%) |
| $20,000 | 20 lot | 2-4 lot (10-20%) | 6-8 lot (30-40%) | 10 lot (50%) |
| $50,000 | 50 lot | 5-10 lot (10-20%) | 15-20 lot (30-40%) | 25 lot (50%) |
| $100,000 | 100 lot | 10-20 lot (10-20%) | 30-40 lot (30-40%) | 50 lot (50%) |

### FORMULA UNIVERSAL:
```
IDEAL (Low Risk) = 10-20% dari Kapasitas Max
MEDIUM Risk = 30-40% dari Kapasitas Max
HIGH Risk = 50% dari Kapasitas Max (tidak disarankan)

Contoh Modal $10,000:
- Kapasitas Max = $10,000 ÷ $1,000 = 10 lot
- IDEAL = 10-20% × 10 = 1-2 lot ✓
- MEDIUM = 30-40% × 10 = 3-4 lot ✓
```

## Satuan Transaksi SPA
- Satuan transaksi di BBJ/JFX adalah "LOT"
- **1 LOT = $1,000 margin** (Day Trade) atau **$2,000** (Overnight)
- Kurs tetap: **1 USD = Rp 10,000**
- Contoh: Dana $10,000 (Rp 100 juta) = maksimal 10 LOT, IDEAL hanya 1-2 LOT

## Perhitungan Nilai Poin per Instrumen

### Gold (XAUUSD/XUL) - DEFAULT (SELALU GUNAKAN INI SEBAGAI CONTOH)
- **1 Poin = $100 per lot** (Contract Size 100 oz × $1 movement)
- Fee Transaksi: **$30/lot** (buka + tutup posisi)
- Contoh: Harga bergerak dari 2650 ke 2653 = +3 poin = +$300/lot

### Silver (XAGUSD/XAG)
- **1 Poin = $50 per lot** (Contract Size 5,000 oz × $0.01 movement)
- Fee Transaksi: **$30/lot**

### Hang Seng (HK50/HSI)
- **1 Point = $5 per lot** (USD 5/point)
- Fee Transaksi: **$30/lot** (15 buka + 15 tutup)

### Nikkei (JP225/NKD)
- **1 Point = $5 per lot** (USD 5/point)
- Fee Transaksi: **$30/lot**

### Forex (GBPUSD, EURUSD, AUDUSD, USDJPY, USDCHF)
- **1 Pip = $10 per lot** (Contract Size 100,000)
- Fee Transaksi: **$30/lot**

### Brent Crude Oil (BCO)
- **1 Poin = $10 per lot** (Contract Size 1,000 barrel)
- Fee Transaksi: **$30/lot**

## Contoh Perhitungan dengan Harga Real-Time

### Gold (XAUUSD) - Default Example (SELALU GUNAKAN GOLD KECUALI DIMINTA LAIN)
```
Harga Real-Time: [ambil dari API quotes]

Entry: Buy 1 Lot @ [harga real-time]
Exit: Sell 1 Lot @ [harga + 3 poin]
Pergerakan: 3 Poin

Gross Profit = 1 Lot × 3 Poin × $100 = $300
Fee Transaksi = 1 Lot × $30 = $30
Net Profit = $300 - $30 = $270
```

### Simulasi Dana $10,000 untuk Gold (CONTOH STANDAR)
```
Dana: $10,000 (setara Rp 100 Juta)
Margin per Lot: $1,000 (Day Trade)
Kapasitas Max: 10 Lot

REKOMENDASI BERDASARKAN RISK:
┌─────────────────┬─────────┬──────────────┬───────────────┐
│ Risk Level      │ Lot     │ Margin Used  │ Buffer        │
├─────────────────┼─────────┼──────────────┼───────────────┤
│ IDEAL (Low)     │ 1-2 lot │ $1,000-2,000 │ $8,000-9,000  │
│ MEDIUM          │ 3-4 lot │ $3,000-4,000 │ $6,000-7,000  │
│ HIGH (Agresif)  │ 5 lot   │ $5,000       │ $5,000        │
└─────────────────┴─────────┴──────────────┴───────────────┘

Dengan 2 Lot (IDEAL):
- Margin Terpakai: 2 × $1,000 = $2,000
- Buffer untuk Floating: $8,000
- Ketahanan: $8,000 ÷ (2 × $100) = 40 poin ✓ (sangat aman)
```

## Temporary Statement
Tampilan saldo sementara yang menunjukkan:
- Previous Balance
- Margin In/Out
- Storage/Rollover
- Profit/Loss
- Facility Fee
- VAT
- Premium/Discount
- New Balance
- Floating P/L
- Equity
- Margin Required
- Effective Margin
- Call Margin Price
- Auto Liquidation Price
- Equity Ratio

## Daily Statement
Konfirmasi transaksi harian yang mencakup:
- Account Status (Previous Balance, New Balance)
- Margin In/Out
- Storage/Rollover (VAT Included)
- Profit/Loss
- Facility Fee
- VAT (Facility Fee)
- Premium/Discount
- Floating P/L
- Equity
- Margin Required
- Effective Margin
- Exchange Rate (1.0000 untuk Fixed Rate)

## Open Positions
Kolom-kolom pada Open Positions:
- Item (XUL10, XAG10_BBJ, BCO10_BBJ, HKK50_BBJ, JPK50_BBJ, GU1010_BBJ, EU1010_BBJ, AU1010_BBJ, UC1010_BBJ, UJ1010_BBJ)
- Unit (Quantity/Lot)
- Date (Buy/Sell Date)
- Bought/Sold Price
- Closing (Current Price)
- Prem/Disc
- Storage
- Floating (Unrealized P/L)

## Kode Instrumen pada Statement
| Kode | Instrumen | Point Value |
|------|-----------|-------------|
| XUL10 | Gold (XAUUSD) | $100/poin/lot |
| XAG10_BBJ | Silver (XAGUSD) | $50/poin/lot |
| BCO10_BBJ | Brent Crude Oil | $10/poin/lot |
| HKK50_BBJ | Hang Seng Index | $5/point/lot |
| JPK50_BBJ | Nikkei 225 | $5/point/lot |
| GU1010_BBJ | GBPUSD | $10/pip/lot |
| EU1010_BBJ | EURUSD | $10/pip/lot |
| AU1010_BBJ | AUDUSD | $10/pip/lot |
| UC1010_BBJ | USDCHF | $10/pip/lot |
| UJ1010_BBJ | USDJPY | $7/pip/lot |

## Analisis Statement - Panduan Konsultasi

### Menghitung Ketahanan Poin
```
Ketahanan Poin = Effective Margin ÷ (Total Lot × Point Value)

Contoh: 
- Effective Margin: $5,000
- Open Position: 2 Lot Gold
- Point Value Gold: $100/lot

Ketahanan = $5,000 ÷ (2 × $100) = 25 poin

Artinya: Akun bisa menahan floating loss hingga 25 poin sebelum margin call
```

### Menghitung Top Up yang Dibutuhkan
```
Target Equity Ratio = 500% (sangat aman)

Top Up = (Margin Required × Target Ratio) - Equity

Contoh:
- Margin Required: $6,000 (6 lot)
- Equity: $10,000
- Target: 500%

Top Up = ($6,000 × 5) - $10,000 = $30,000 - $10,000 = $20,000

Jika hasil negatif = tidak perlu top up (sudah aman)
```

### Rekomendasi Posisi Berdasarkan Floating P/L
- Floating PROFIT > 30 poin: Pertimbangkan take profit sebagian
- Floating LOSS < -20 poin: Evaluasi apakah perlu cut loss
- Floating LOSS mendekati ketahanan: URGENT - pertimbangkan cut loss segera

## Catatan Penting
- Semua perhitungan dalam USD
- Fixed Rate: 1 USD = Rp 10,000
- Statement adalah dokumen resmi yang harus dicek dalam 2 hari kerja
- Analisis statement bersifat EDUKATIF, bukan saran investasi
