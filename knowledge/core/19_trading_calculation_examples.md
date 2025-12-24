# Contoh Perhitungan Trading SPA

## PENTING: RUMUS MARGIN SPA (BUKAN LEVERAGE)

**JANGAN GUNAKAN RUMUS LEVERAGE!** SPA menggunakan FIXED MARGIN per lot.

### Rumus yang SALAH (JANGAN DIGUNAKAN):
```
SALAH: Margin = Contract Size × Harga × Leverage  ❌
SALAH: Margin = 100 oz × $2650 / 100 = $2,650    ❌
```

### Rumus yang BENAR (SPA Trading Rules):
```
BENAR: Initial Margin = $1,000 per lot (Day Trade)    ✓
BENAR: Initial Margin = $2,000 per lot (Overnight)    ✓
```

## Satuan Transaksi SPA
- Satuan transaksi di BBJ/JFX adalah "LOT"
- **1 LOT = $1,000 margin** (Day Trade) atau **$2,000** (Overnight)
- Contoh: Dana $10,000 = maksimal 10 LOT (day trade) atau 5 LOT (overnight)

## Perhitungan Nilai Poin per Instrumen

### Gold (XAUUSD/XUL) - DEFAULT
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

## Contoh Perhitungan dengan Harga Real-Time

### Gold (XAUUSD) - Default Example
```
Harga Real-Time: $2,650 (ambil dari API quotes)

Entry: Buy 1 Lot @ 2650
Exit: Sell 1 Lot @ 2653
Pergerakan: 3 Poin

Gross Profit = 1 Lot × 3 Poin × $100 = $300
Fee Transaksi = 1 Lot × $30 = $30
Net Profit = $300 - $30 = $270
```

### Simulasi Dana $10,000 untuk Gold
```
Dana: $10,000
Margin per Lot: $1,000 (Day Trade)
Maksimal Lot: 10 Lot
Rekomendasi: 5 Lot (50% dana untuk buffer floating)

Margin Terpakai: 5 × $1,000 = $5,000
Sisa Dana: $5,000 (untuk floating)
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
- Item (XUL10, XAG10_BBJ, BCO10_BBJ)
- Unit (Quantity/Lot)
- Date (Buy/Sell Date)
- Bought/Sold Price
- Closing (Current Price)
- Prem/Disc
- Storage
- Floating (Unrealized P/L)

## Catatan Penting
- Semua perhitungan dalam USD
- Fixed Rate: 1 USD = Rp 10,000
- Statement adalah dokumen resmi yang harus dicek dalam 2 hari kerja
