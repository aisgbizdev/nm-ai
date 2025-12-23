// src/app/api/nm-ai/config/indexMarginConfig.ts

export const INDEX_MARGIN_CONFIG = {
  tradeCode: {
    HK: {
      fixed: "HKK50_BBJ (Fixed Rate)",
      floating: "HKK5U_BBJ (Floating Rate)",
    },
    JP: {
      fixed: "JPK50_BBJ (Fixed Rate)",
      floating: "JPK5U_BBJ (Floating Rate)",
    },
  },
  contractSize: {
    HK: "USD 5/point",
    JP: "USD 5/point",
  },
  tradingHours: {
    HK: {
      session1: "08.15 - 11.00 WIB",
      session2: "12.00 - 15.30 WIB",
      session3: "16.15 - 02.00 WIB",
    },
    JP: {
      session1: "06.30 - 13.25 WIB",
      session2: "14.25 - 03.45 WIB",
      session3: null,
    },
  },
  initialMargin: {
    dayTrade: {
      HK: "USD 1,000/lot",
      JP: "USD 1,000/lot",
    },
    overnight: {
      HK: "USD 2,000/lot",
      JP: "USD 2,000/lot",
    },
  },
  maintenanceMargin: {
    HK: "70% of Initial Margin",
    JP: "70% of Initial Margin",
  },
  autoLiquidation: {
    HK: "30% of Initial Margin",
    JP: "30% of Initial Margin",
  },
  facilityFee: {
    HK: "USD 15 / Lot / Side",
    JP: "USD 15 / Lot / Side",
  },
  rolloverFacility: {
    sell: {
      HK: "USD 3/lot/night",
      JP: "USD 2/lot/night",
    },
    buy: {
      HK: "USD 3/lot/night",
      JP: "USD 2/lot/night",
    },
    vat: 0.11,
  },
  price: {
    source: {
      HK: "Telequote",
      JP: "Telequote",
    },
    guidance: {
      HK: "Last Trade",
      JP: "Last Trade",
    },
    minimumPriceSpreadQuote: {
      HK: "8 point/side",
      JP: "10 point/side",
    },
    hecticPriceSpreadQuote: {
      HK: "Based On Market",
      JP: "Based On Market",
    },
    minimumPriceMovement: {
      HK: "1 Point",
      JP: "5 Points",
    },
    rangeForLimitAndStopOrder: {
      HK: "20 - 500 Points",
      JP: "20 - 500 Points",
    },
    hecticPriceRangeForLimitAndStopOrder: {
      HK: "Based On Market",
      JP: "Based On Market",
    },
  },
  delivery: {
    HK: "Cash Settlement",
    JP: "Cash Settlement",
  },
} as const;
