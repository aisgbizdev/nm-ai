// src/app/api/nm-ai/config/currencyMarginConfig.ts

export const CURRENCY_MARGIN_CONFIG = {
  tradeCode: {
    GU: {
      fixed: "GU1010_BBJ (Fixed Rate)",
      floating: "GU10F_BBJ (Floating Rate)",
    },
    EU: {
      fixed: "EU1010_BBJ (Fixed Rate)",
      floating: "EU10F_BBJ (Floating Rate)",
    },
    AU: {
      fixed: "AU1010_BBJ (Fixed Rate)",
      floating: "AU10F_BBJ (Floating Rate)",
    },
    UC: {
      fixed: "UC1010_BBJ (Fixed Rate)",
      floating: "UC10F_BBJ (Floating Rate)",
    },
    UJ: {
      fixed: "UJ1010_BBJ (Fixed Rate)",
      floating: "UJ10F_BBJ (Floating Rate)",
    },
  },

  contractSize: {
    GU: "GBP 100.000",
    EU: "EU 100.000",
    AU: "AU 100.000",
    UC: "USD 100.000",
    UJ: "USD 100.000",
  },

  tradingHours: {
    GU: {
      days: "Monday - Friday",
      session1: "Summer: 07.00 -03.00 WIB",
      session2: "Winter: 07.00 - 04.00 WIB",
      session3: null,
    },
    EU: {
      days: "Monday - Friday",
      session1: "Summer: 07.00 -03.00 WIB",
      session2: "Winter: 07.00 - 04.00 WIB",
      session3: null,
    },
    AU: {
      days: "Monday - Friday",
      session1: "Summer: 07.00 -03.00 WIB",
      session2: "Winter: 07.00 - 04.00 WIB",
      session3: null,
    },
    UC: {
      days: "Monday - Friday",
      session1: "Summer: 07.00 -03.00 WIB",
      session2: "Winter: 07.00 - 04.00 WIB",
      session3: null,
    },
    UJ: {
      days: "Monday - Friday",
      session1: "Summer: 07.00 -03.00 WIB",
      session2: "Winter: 07.00 - 04.00 WIB",
      session3: null,
    },
  },

  initialMargin: {
    dayTrade: {
      GU: "USD 1,000/lot",
      EU: "USD 1,000/lot",
      AU: "USD 1,000/lot",
      UC: "USD 1,000/lot",
      UJ: "USD 1,000/lot",
    },
    overnight: {
      GU: "USD 2,000/lot",
      EU: "USD 2,000/lot",
      AU: "USD 2,000/lot",
      UC: "USD 2,000/lot",
      UJ: "USD 2,000/lot",
    },
  },

  maintenanceMargin: {
    GU: "70% of Initial Margin",
    EU: "70% of Initial Margin",
    AU: "70% of Initial Margin",
    UC: "70% of Initial Margin",
    UJ: "70% of Initial Margin",
  },

  autoLiquidation: {
    GU: "30% of Initial Margin",
    EU: "30% of Initial Margin",
    AU: "30% of Initial Margin",
    UC: "30% of Initial Margin",
    UJ: "30% of Initial Margin",
  },

  facilityFee: {
    GU: "USD 15 / Lot / Side",
    EU: "USD 15 / Lot / Side",
    AU: "USD 15 / Lot / Side",
    UC: "USD 15 / Lot / Side",
    UJ: "USD 15 / Lot / Side",
  },

  rolloverFacility: {
    sell: {
      GU: "USD 5/lot/night",
      EU: "USD 5/lot/night",
      AU: "USD 5/lot/night",
      UC: "USD 5/lot/night",
      UJ: "USD 5/lot/night",
    },
    buy: {
      GU: "USD 5/lot/night",
      EU: "USD 5/lot/night",
      AU: "USD 5/lot/night",
      UC: "USD 5/lot/night",
      UJ: "USD 5/lot/night",
    },
    vat: 0.11,
  },

  price: {
    source: {
      GU: "Telequote",
      EU: "Telequote",
      AU: "Telequote",
      UC: "Telequote",
      UJ: "Telequote",
    },
    guidance: {
      GU: "Last Trade",
      EU: "Last Trade",
      AU: "Last Trade",
      UC: "Last Trade",
      UJ: "Last Trade",
    },
    minimumPriceSpreadQuote: {
      GU: "4 point/side",
      EU: "4 point/side",
      AU: "4 point/side",
      UC: "4 point/side",
      UJ: "4 point/side",
    },
    hecticPriceSpreadQuote: {
      GU: "Based On Market",
      EU: "Based On Market",
      AU: "Based On Market",
      UC: "Based On Market",
      UJ: "Based On Market",
    },
    minimumPriceMovement: {
      GU: "0,0001 Points (USD 10)",
      EU: "0,0001 Points (USD 10)",
      AU: "0,0001 Points (USD 10)",
      UC: "0,0001 Points (USD 10)",
      UJ: "0,0001 Points (USD 10)",
    },
    rangeForLimitAndStopOrder: {
      GU: "20 - 2000 Points/pips",
      EU: "20 - 2000 Points/pips",
      AU: "20 - 2000 Points/pips",
      UC: "20 - 2000 Points/pips",
      UJ: "20 - 2000 Points/pips",
    },
    hecticPriceRangeForLimitAndStopOrder: {
      GU: "Based On Market",
      EU: "Based On Market",
      AU: "Based On Market",
      UC: "Based On Market",
      UJ: "Based On Market",
    },
  },

  delivery: {
    GU: "Cash Settlement",
    EU: "Cash Settlement",
    AU: "Cash Settlement",
    UC: "Cash Settlement",
    UJ: "Cash Settlement",
  },
} as const;
