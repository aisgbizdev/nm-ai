# Contoh Perhitungan Trading SPA

## Satuan Transaksi
- Satuan transaksi di BBJ/JFX adalah "LOT"
- **1 LOT = $1,000** (setara Rp 10 Juta dengan kurs 1 USD = Rp 10,000)
- Contoh: Pembukaan rekening $10,000 = maksimal 10 LOT

## Perhitungan Nilai Poin (Gold/XUL)
- **1 Poin = $100 per lot** (Contract Size 100 oz × $1 movement)
- Fee Transaksi: **$30/lot** (buka + tutup posisi)

### Contoh Perhitungan Keuntungan
```
Entry: Buy 1 Lot @ 2330
Exit: Sell 1 Lot @ 2333
Pergerakan: 3 Poin

Gross Profit = 1 Lot × 3 Poin × $100 = $300
Fee Transaksi = 1 Lot × $30 = $30
Net Profit = $300 - $30 = $270
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
