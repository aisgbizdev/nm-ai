// src/app/api/nm-ai/config/commodityMarginConfig.ts

export const COMMODITY_MARGIN_CONFIG = {
  tradeCode: {
    XUL: {
      fixed: "XUL10 (Fixed Rate)",
      floating: "XULF (Floating Rate)",
    },
    XAG: {
      fixed: "XAG10_BBJ (Fixed Rate)",
      floating: "XAGF_BBJ (Floating Rate)",
    },
    BCO: {
      fixed: "BCO10_BBJ (Fixed Rate)",
      floating: "BCOF_BBJ (Floating Rate)",
    },
  },
  contractSize: {
    XUL: "100 Troy Ounce",
    XAG: "5.000 Troy Ounce",
    BCO: "USD 1.000 per Barrel",
  },
  tradingHours: {
    XUL: {
      days: "Monday - Friday",
      session1: "Summer: 06.00 -03.30 WIB",
      session2: "Winter: 06.00 - 04.30 WIB",
      session3: null,
    },
    XAG: {
      days: "Monday - Friday",
      session1: "Summer: 06.00 -03.30 WIB",
      session2: "Winter: 06.00 - 04.30 WIB",
      session3: null,
    },
    BCO: {
      days: "Monday - Friday",
      session1: "07:00 - 03:45 WIB",
      session2: null,
      session3: null,
    },
  },
  initialMargin: {
    dayTrade: {
      XUL: "USD 1,000/lot",
      XAG: "USD 1,000/lot",
      BCO: "USD 1,000/lot",
    },
    overnight: {
      XUL: "USD 2,000/lot",
      XAG: "USD 2,000/lot",
      BCO: "USD 2,000/lot",
    },
  },
  maintenanceMargin: {
    XUL: "70% of Initial Margin",
    XAG: "70% of Initial Margin",
    BCO: "70% of Initial Margin",
  },
  autoLiquidation: {
    XUL: "30% of Initial Margin",
    XAG: "30% of Initial Margin",
    BCO: "30% of Initial Margin",
  },
  facilityFee: {
    XUL: "USD 15 / Lot / Side",
    XAG: "USD 15 / Lot / Side",
    BCO: "USD 15 / Lot / Side",
  },
  rolloverFacility: {
    sell: {
      XUL: "USD 5/lot/night",
      XAG: "USD 5/lot/night",
      BCO: "USD 5/lot/night",
    },
    buy: {
      XUL: "USD 5/lot/night",
      XAG: "USD 5/lot/night",
      BCO: "USD 5/lot/night",
    },
    vat: 0.11,
  },
  price: {
    source: {
      XUL: "Telequote",
      XAG: "Telequote",
      BCO: "Telequote",
    },
    guidance: {
      XUL: "Last Trade",
      XAG: "Last Trade",
      BCO: "Last Trade",
    },
    minimumPriceSpreadQuote: {
      XUL: "USD 0,40/Troy Ounce/Side",
      XAG: "USD 0,015/Troy Ounce/Side",
      BCO: "0.10 pips/barrel/side",
    },
    maximumPriceSpreadQuote: {
      XUL: "USD 0,40/Troy Ounce/Side",
      XAG: "USD 0,015/Troy Ounce/Side",
      BCO: "0.10 pips/barrel/side",
    },
    hecticPriceSpreadQuote: {
      XUL: "Based On Market",
      XAG: "Based On Market",
      BCO: "Based On Market",
    },
    minimumPriceMovement: {
      XUL: "USD 0,01/Troy Ounce",
      XAG: "USD 0,001/Troy Ounce",
      BCO: "USD 0,01/Barrel",
    },
    rangeForLimitAndStopOrder: {
      XUL: "USD 6 - USD 20",
      XAG: "20 - 2000 Points/pips",
      BCO: "2,00 - 20,00 Points/pips",
    },
    hecticPriceRangeForLimitAndStopOrder: {
      XUL: "Based On Market",
      XAG: "Based On Market",
      BCO: "Based On Market",
    },
  },
  delivery: {
    XUL: "Cash Settlement",
    XAG: "Cash Settlement",
    BCO: "Cash Settlement",
  },
} as const;
