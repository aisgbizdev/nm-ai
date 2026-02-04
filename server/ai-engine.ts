import OpenAI from "openai";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";
import { handleCalculation } from "./calculators";
import { fetchNews, formatNewsForChat, isNewsRequest as checkNewsIntent } from "./newsFetcher";

const CALENDAR_API_URL = process.env.CALENDAR_API_URL || "https://endpoapi-production-3202.up.railway.app/api/calendar/this-week";

// Fetch today's economic calendar events for context
interface CalendarEvent {
  time: string;
  currency: string;
  impact: string;
  event: string;
}

let cachedCalendarEvents: CalendarEvent[] = [];
let calendarCacheTime = 0;
const CALENDAR_CACHE_TTL = 300000; // 5 minutes

async function fetchCalendarForContext(): Promise<CalendarEvent[]> {
  const now = Date.now();
  if (cachedCalendarEvents.length > 0 && now - calendarCacheTime < CALENDAR_CACHE_TTL) {
    return cachedCalendarEvents;
  }
  
  try {
    const nowJakarta = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
    const todayIso = nowJakarta.toISOString().split("T")[0];
    
    // API returns whole week, we fetch and filter to today
    const response = await fetch(CALENDAR_API_URL, { method: "GET" });
    if (!response.ok) {
      console.log("Calendar API not available for context");
      return cachedCalendarEvents;
    }
    
    const data = await response.json();
    const allEvents = Array.isArray(data.data) ? data.data : [];
    
    // Filter to today's events only
    const todayEvents = allEvents.filter((ev: any) => 
      ev.date === todayIso || (ev.time && ev.time.startsWith(todayIso))
    );
    
    cachedCalendarEvents = todayEvents.slice(0, 10).map((ev: any) => ({
      time: ev.time?.split(" ")[1] || "-", // Extract just the time part
      currency: ev.currency || "-",
      impact: ev.impact || "-",
      event: ev.event || "-",
    }));
    calendarCacheTime = now;
    console.log(`Calendar context: ${cachedCalendarEvents.length} events for today`);
    return cachedCalendarEvents;
  } catch (err) {
    console.error("Failed to fetch calendar for context:", err);
    return cachedCalendarEvents;
  }
}

const openaiClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:1.5b";
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS || "7000");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const KNOWLEDGE_CORE_PATH = path.join(process.cwd(), "knowledge", "core");
const QUOTES_API_URL = process.env.QUOTES_API_URL || "https://endpoapi-production-3202.up.railway.app/api/live-quotes";

// Cached live prices with 60 second TTL
let cachedPrices: Record<string, number> = {};
let pricesCacheTime = 0;
const PRICES_CACHE_TTL = 60000; // 60 seconds

// OHLC price data structure
interface OHLCData {
  last: number;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
}

// Fallback prices (realistic ranges for 2026)
const FALLBACK_PRICES: Record<string, number> = {
  XAUUSD: 4500,
  XAGUSD: 55,
  BCO: 85,
  HSI: 18000,
  JP225: 39000,
  EURUSD: 1.08,
  GBPUSD: 1.25,
  AUDUSD: 0.65,
  USDJPY: 155,
  USDCHF: 0.90,
};

// Cache for full OHLC data
let cachedOHLC: Record<string, OHLCData> = {};
let ohlcCacheTime = 0;

async function fetchLivePricesCached(): Promise<Record<string, number>> {
  const now = Date.now();
  if (Object.keys(cachedPrices).length > 0 && now - pricesCacheTime < PRICES_CACHE_TTL) {
    return cachedPrices;
  }
  
  try {
    const response = await fetch(QUOTES_API_URL, { method: "GET" });
    if (!response.ok) {
      console.log("Quote API not available, using fallback prices");
      return FALLBACK_PRICES;
    }
    
    const data = await response.json();
    const quotes = Array.isArray(data.data) ? data.data : [];
    
    const prices: Record<string, number> = {};
    
    const ohlcData: Record<string, OHLCData> = {};
    
    for (const q of quotes) {
      const symbol = (q.symbol || "").toUpperCase();
      const price = parseFloat(q.last);
      if (isNaN(price)) continue;
      
      // Build OHLC data
      const ohlc: OHLCData = {
        last: price,
        high: q.high ? parseFloat(q.high) : undefined,
        low: q.low ? parseFloat(q.low) : undefined,
        open: q.open ? parseFloat(q.open) : undefined,
        prevClose: q.prevClose ? parseFloat(q.prevClose) : undefined,
      };
      
      // Map API symbols to standard names
      if (symbol.includes("XUL") || symbol.includes("XAU")) {
        prices.XAUUSD = price;
        ohlcData.XAUUSD = ohlc;
      }
      else if (symbol.includes("XAG") || symbol.includes("LSI")) {
        prices.XAGUSD = price;
        ohlcData.XAGUSD = ohlc;
      }
      else if (symbol.includes("BCO")) {
        prices.BCO = price;
        ohlcData.BCO = ohlc;
      }
      else if (symbol.includes("HKK50") || symbol.includes("HSI")) {
        prices.HSI = price;
        ohlcData.HSI = ohlc;
      }
      else if (symbol.includes("JPK50") || symbol.includes("JPN")) {
        prices.JP225 = price;
        ohlcData.JP225 = ohlc;
      }
      else if (symbol.includes("EU10") || symbol.includes("EUR")) {
        prices.EURUSD = price;
        ohlcData.EURUSD = ohlc;
      }
      else if (symbol.includes("GU10") || symbol.includes("GBP")) {
        prices.GBPUSD = price;
        ohlcData.GBPUSD = ohlc;
      }
      else if (symbol.includes("AU10")) {
        prices.AUDUSD = price;
        ohlcData.AUDUSD = ohlc;
      }
      else if (symbol.includes("UJ10")) {
        prices.USDJPY = price;
        ohlcData.USDJPY = ohlc;
      }
      else if (symbol.includes("UC10")) {
        prices.USDCHF = price;
        ohlcData.USDCHF = ohlc;
      }
    }
    
    // Fill missing with fallback
    for (const [key, val] of Object.entries(FALLBACK_PRICES)) {
      if (!prices[key]) prices[key] = val;
    }
    
    cachedPrices = prices;
    cachedOHLC = ohlcData;
    pricesCacheTime = now;
    ohlcCacheTime = now;
    return prices;
  } catch (err) {
    console.error("Failed to fetch live prices:", err);
    return FALLBACK_PRICES;
  }
}

function buildLivePriceContext(prices: Record<string, number>): string {
  // Build OHLC section for main instruments
  const goldOHLC = cachedOHLC.XAUUSD;
  const oilOHLC = cachedOHLC.BCO;
  
  let ohlcSection = "";
  
  if (goldOHLC) {
    ohlcSection += `\n## DATA OHLC GOLD (GUNAKAN UNTUK LEVEL KUNCI!)
| Data | Nilai |
|------|-------|
| Last | $${goldOHLC.last.toFixed(2)} |
| High | $${goldOHLC.high?.toFixed(2) || 'N/A'} |
| Low | $${goldOHLC.low?.toFixed(2) || 'N/A'} |
| Open | $${goldOHLC.open?.toFixed(2) || 'N/A'} |
| Prev Close | $${goldOHLC.prevClose?.toFixed(2) || 'N/A'} |

**GUNAKAN DATA INI untuk analisis Gold:**
- Resistance intraday: ${goldOHLC.high?.toFixed(2) || 'N/A'} (High hari ini)
- Support intraday: ${goldOHLC.low?.toFixed(2) || 'N/A'} (Low hari ini)
`;
  }
  
  if (oilOHLC) {
    ohlcSection += `\n## DATA OHLC OIL
| Data | Nilai |
|------|-------|
| Last | $${oilOHLC.last.toFixed(2)} |
| High | $${oilOHLC.high?.toFixed(2) || 'N/A'} |
| Low | $${oilOHLC.low?.toFixed(2) || 'N/A'} |
`;
  }

  return `## HARGA REAL-TIME (GUNAKAN UNTUK CONTOH!)
PENTING: Selalu gunakan harga ini untuk contoh dan analisis, JANGAN gunakan harga lama!

| Instrumen | Harga Saat Ini |
|-----------|---------------|
| Gold (XAUUSD) | $${prices.XAUUSD?.toFixed(2) || FALLBACK_PRICES.XAUUSD} |
| Silver (XAGUSD) | $${prices.XAGUSD?.toFixed(2) || FALLBACK_PRICES.XAGUSD} |
| Brent Oil (BCO) | $${prices.BCO?.toFixed(2) || FALLBACK_PRICES.BCO} |
| Hang Seng (HSI) | ${prices.HSI?.toFixed(0) || FALLBACK_PRICES.HSI} |
| Nikkei (JP225) | ${prices.JP225?.toFixed(0) || FALLBACK_PRICES.JP225} |
| EUR/USD | ${prices.EURUSD?.toFixed(4) || FALLBACK_PRICES.EURUSD} |
| GBP/USD | ${prices.GBPUSD?.toFixed(4) || FALLBACK_PRICES.GBPUSD} |
| AUD/USD | ${prices.AUDUSD?.toFixed(4) || FALLBACK_PRICES.AUDUSD} |
| USD/JPY | ${prices.USDJPY?.toFixed(2) || FALLBACK_PRICES.USDJPY} |

*Harga bersifat indikatif dari sistem Newsmaker.id*
${ohlcSection}
## INSTRUKSI ANALISIS HARGA - WAJIB DIPATUHI:

**DILARANG KERAS** menggunakan level bulat generik seperti $5000, $5200, $5300!

**WAJIB** gunakan data OHLC di atas untuk level kunci:
- **Resistance Intraday**: WAJIB gunakan High hari ini (lihat data OHLC)
- **Support Intraday**: WAJIB gunakan Low hari ini (lihat data OHLC)
- **Pivot Area**: Gunakan Open dan Prev Close sebagai referensi
- **Entry/Stop Loss**: Hitung dari High/Low +/- buffer kecil (5-10 poin untuk Gold)

**CONTOH BENAR** (jika Gold High=5091.78, Low=4910.46, Last=5029.86):
- Resistance minor: 5091.78 (High hari ini - dari data OHLC!)
- Support minor: 4910.46 (Low hari ini - dari data OHLC!)
- Entry Buy: 5035-5045 (di atas current price dengan konfirmasi)
- Stop Loss: 4905 (di bawah Low hari ini)

**CONTOH SALAH** (JANGAN seperti ini - AKAN DIANGGAP GAGAL):
- Resistance: $5200 (terlalu bulat, tidak berdasarkan data OHLC)
- Support: $5000 (terlalu bulat, tidak berdasarkan data OHLC)

**CATATAN**: Jika data High/Low tidak tersedia, gunakan harga saat ini sebagai acuan dan berikan range realistis (+/- 1-2% dari current price). JANGAN PERNAH menggunakan level bulat tanpa basis data.
`;
}

function generateFollowUpQuestions(query: string, response: string): string {
  const queryLower = query.toLowerCase();
  const lang = detectLanguage(query);
  
  let questions: string[] = [];
  
  if (queryLower.includes("margin") || queryLower.includes("lot") || queryLower.includes("modal")) {
    questions = lang === 'id' 
      ? ["Berapa ketahanan dana dengan lot ini?", "Kalender ekonomi hari ini", "Harga gold sekarang berapa?"]
      : ["What's my fund resilience with this lot?", "Economic calendar today", "Show gold price now"];
  } else if (queryLower.includes("gold") || queryLower.includes("emas") || queryLower.includes("xau")) {
    questions = lang === 'id'
      ? ["Hitung margin untuk 2 lot gold", "Kalender ekonomi hari ini", "Pivot point gold dengan OHLC"]
      : ["Calculate margin for 2 lots gold", "Economic calendar today", "Gold pivot point with OHLC"];
  } else if (queryLower.includes("kalender") || queryLower.includes("calendar") || queryLower.includes("jadwal")) {
    questions = lang === 'id'
      ? ["Harga gold sekarang berapa?", "Berapa lot ideal untuk modal $10,000?", "Jelaskan dampak berita high impact"]
      : ["Show gold price now", "Ideal lot for $10,000 capital?", "Explain high impact news effect"];
  } else if (queryLower.includes("berita") || queryLower.includes("news") || queryLower.includes("update")) {
    questions = lang === 'id'
      ? ["Harga gold sekarang berapa?", "Kalender ekonomi hari ini", "Bagaimana dampak berita ini ke trading?"]
      : ["Show gold price now", "Economic calendar today", "How does this news affect trading?"];
  } else if (queryLower.includes("risiko") || queryLower.includes("risk") || queryLower.includes("manajemen")) {
    questions = lang === 'id'
      ? ["Simulasi trading dengan modal $10,000", "Apa itu margin call?", "Kalender ekonomi hari ini"]
      : ["Trading simulation with $10,000 capital", "What is margin call?", "Economic calendar today"];
  } else if (queryLower.includes("penipuan") || queryLower.includes("scam") || queryLower.includes("legal") || queryLower.includes("bappebti")) {
    questions = lang === 'id'
      ? ["Broker resmi yang terdaftar di Bappebti", "Cara cek legalitas perusahaan", "Ciri-ciri investasi bodong"]
      : ["Official brokers registered with Bappebti", "How to check company legality", "Signs of investment fraud"];
  } else if (queryLower.includes("pivot") || queryLower.includes("fibonacci") || queryLower.includes("fibo")) {
    questions = lang === 'id'
      ? ["Hitung margin untuk 2 lot gold", "Kalender ekonomi hari ini", "Harga gold sekarang berapa?"]
      : ["Calculate margin for 2 lots gold", "Economic calendar today", "Show gold price now"];
  } else if (queryLower.includes("broker") || queryLower.includes("pialang")) {
    questions = lang === 'id'
      ? ["Cara cek legalitas broker", "Berapa modal minimum trading?", "Apa itu margin dan lot?"]
      : ["How to check broker legality", "Minimum trading capital?", "What is margin and lot?"];
  } else {
    questions = lang === 'id'
      ? ["Harga gold sekarang berapa?", "Kalender ekonomi hari ini", "Berapa lot ideal untuk modal $10,000?"]
      : ["Show gold price now", "Economic calendar today", "Ideal lot for $10,000 capital?"];
  }
  
  const header = lang === 'id' 
    ? "\n\n💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*"
    : "\n\n💡 **Want to explore more?** *(Just type the number)*";
  
  return `${header}\n1. "${questions[0]}"\n2. "${questions[1]}"\n3. "${questions[2]}"`;
}

function isGibberishResponse(text: string): boolean {
  if (!text || text.length < 20) return true;
  
  const words = text.split(/\s+/);
  if (words.length < 3) return true;
  
  const meaningfulWords = words.filter(w => w.length >= 2);
  if (meaningfulWords.length < words.length * 0.5) return true;
  
  const indonesianWords = ['dan', 'atau', 'yang', 'untuk', 'dari', 'dengan', 'ini', 'itu', 'adalah', 'dalam', 'pada', 'ke', 'di', 'tersebut', 'akan', 'jika', 'bisa', 'dapat', 'ada', 'tidak', 'harga', 'trading', 'market', 'analisa'];
  const hasIndonesian = indonesianWords.some(w => text.toLowerCase().includes(w));
  
  const repeatingPattern = /(.{3,})\1{3,}/i;
  if (repeatingPattern.test(text)) return true;
  
  const weirdChars = text.match(/[^\w\s.,!?():\-\[\]@#$%&*+='"<>/\\;`~|{}àáâãäåæçèéêëìíîïðñòóôõöùúûüýÿ]/g);
  if (weirdChars && weirdChars.length > text.length * 0.1) return true;
  
  if (!hasIndonesian && !text.includes(' ')) return true;
  
  return false;
}

function isNewsRequest(query: string): boolean {
  const queryLower = query.toLowerCase();
  
  // Exclude calendar requests from being detected as news
  const calendarKeywords = ['kalender', 'calendar', 'jadwal berita'];
  if (calendarKeywords.some(k => queryLower.includes(k))) {
    return false;
  }
  
  const exclusionKeywords = ['banding', 'compare', 'versus', 'vs', 'perbedaan', 'difference', 'kelebihan', 'kekurangan', 'pros', 'cons', 'mana yang', 'which is'];
  if (exclusionKeywords.some(k => queryLower.includes(k))) {
    return false;
  }
  
  const newsPatterns = [
    /berita/i,
    /news/i,
    /kabar/i,
    /update.*pasar/i,
    /update.*market/i,
    /apa.*terjadi/i,
    /what.*happening/i,
    /headline/i,
    /terbaru/i,
    /latest/i,
    /info.*hari ini/i,
    /situasi.*pasar/i,
    /kondisi.*pasar/i,
  ];
  
  return newsPatterns.some(p => p.test(queryLower)) || checkNewsIntent(query);
}

function detectLanguage(query: string): 'id' | 'en' {
  const queryLower = query.toLowerCase();
  
  // Indonesian question words and common words
  const indonesianWords = [
    // Question words
    'apa', 'bagaimana', 'berapa', 'kenapa', 'mengapa', 'dimana', 'kapan', 'siapa',
    // Request words
    'tolong', 'minta', 'bisa', 'cara', 'gimana', 'kasih', 'tahu', 'jelaskan', 'ceritakan',
    // Informal words
    'dong', 'donk', 'bro', 'kak', 'mas', 'mba', 'gan', 'sis', 'min', 'gak', 'gk', 'ga', 'nggak', 'ngga',
    // Common words
    'tidak', 'iya', 'ya', 'dan', 'atau', 'untuk', 'dari', 'dengan', 'yang', 'ini', 'itu',
    'saya', 'aku', 'gue', 'gw', 'kamu', 'anda', 'kalian', 'mereka', 'kita',
    // Trading-specific Indonesian
    'harga', 'saham', 'untung', 'rugi', 'modal', 'jual', 'beli', 'naik', 'turun',
    'sekarang', 'hari', 'kemarin', 'besok', 'minggu', 'bulan', 'tahun',
    // Sentence endings
    'ya?', 'kan?', 'sih', 'kok', 'deh', 'lho', 'lah', 'nih', 'tuh'
  ];
  
  // English words that indicate English query
  const englishWords = [
    'what', 'how', 'why', 'where', 'when', 'who', 'which', 'whose',
    'please', 'can', 'could', 'would', 'should', 'will', 'shall',
    'the', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were',
    'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their',
    'calculate', 'show', 'tell', 'explain', 'help', 'need', 'want'
  ];
  
  // Count matches
  const indonesianMatches = indonesianWords.filter(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(queryLower) || queryLower.includes(w);
  }).length;
  
  const englishMatches = englishWords.filter(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(queryLower);
  }).length;
  
  // If more Indonesian matches, it's Indonesian
  // Default to Indonesian if no clear winner (since target audience is Indonesian)
  return indonesianMatches >= englishMatches ? 'id' : 'en';
}

function getNewsResponse(lang: 'id' | 'en'): string {
  if (lang === 'en') {
    return `## Latest News from Newsmaker.id

To get the latest trading news from Newsmaker.id, please visit directly:

**Official Website:**
[newsmaker.id](https://newsmaker.id)

**Real-time Updates via Social Media:**
- TikTok Live: [@newsmaker23_talk](https://tiktok.com/@newsmaker23_talk) - Morning Call every morning
- TikTok Education: [@newsmaker23](https://tiktok.com/@newsmaker23) - Daily educational content

**Mobile Apps:**
- **Newsmaker23 App** - News & analysis on your phone
- **Pro Trader App** - Real-time quotes + signal alerts

The Newsmaker.id editorial team updates news every trading day with in-depth and accurate analysis.

💡 **Want to explore more?** *(Just type the number)*
1. "Show me gold price now"
2. "Economic calendar today"
3. "How to calculate margin for 2 lots gold?"

---
*NM Ai - Newsmaker.id*
*This information is educational, not investment advice.*`;
  }
  
  return `## Berita Terbaru Newsmaker.id

Untuk mendapatkan berita trading terbaru dari Newsmaker.id, silakan kunjungi langsung:

**Website Resmi:**
[newsmaker.id](https://newsmaker.id)

**Update Real-time via Sosial Media:**
- TikTok Live: [@newsmaker23_talk](https://tiktok.com/@newsmaker23_talk) - Morning Call setiap pagi
- TikTok Edukasi: [@newsmaker23](https://tiktok.com/@newsmaker23) - Konten edukatif harian

**Aplikasi Mobile:**
- **Newsmaker23 App** - Berita & analisa langsung di HP
- **Pro Trader App** - Quotes real-time + signal alerts

Tim editorial Newsmaker.id update berita setiap hari perdagangan dengan analisa yang mendalam dan akurat.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Harga gold sekarang berapa?"
2. "Kalender ekonomi hari ini"
3. "Berapa margin untuk 2 lot gold?"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

export interface AIResponse {
  content: string;
  source: "calculator" | "knowledge" | "learned" | "ollama" | "openai" | "news" | "vision";
  cached?: boolean;
}

let cachedCoreKnowledge: string | null = null;
let coreKnowledgeLoadTime = 0;
const KNOWLEDGE_CACHE_TTL = 300000;

export async function loadCoreKnowledge(): Promise<string> {
  const now = Date.now();
  if (cachedCoreKnowledge && now - coreKnowledgeLoadTime < KNOWLEDGE_CACHE_TTL) {
    return cachedCoreKnowledge;
  }
  
  try {
    const files = fs.readdirSync(KNOWLEDGE_CORE_PATH).sort();
    let combined = "";
    
    for (const file of files) {
      if (file.endsWith(".md") || file.endsWith(".yaml") || file.endsWith(".txt")) {
        const content = fs.readFileSync(path.join(KNOWLEDGE_CORE_PATH, file), "utf-8");
        combined += `\n\n--- ${file} ---\n${content}`;
      }
    }
    
    cachedCoreKnowledge = combined;
    coreKnowledgeLoadTime = now;
    return combined;
  } catch (err) {
    console.error("Failed to load core knowledge:", err);
    return "";
  }
}

// Build market context with news + calendar for analysis
function buildMarketContext(
  newsItems: Array<{title: string; excerpt?: string; publishedAt?: string; category?: string}>,
  calendarEvents: CalendarEvent[]
): string {
  const hasNews = newsItems && newsItems.length > 0;
  const hasCalendar = calendarEvents && calendarEvents.length > 0;
  
  // If no data available, return minimal context
  if (!hasNews && !hasCalendar) {
    return `\n## CATATAN: Data berita/kalender sedang tidak tersedia. Gunakan harga REAL dari tabel di atas untuk analisis.\n`;
  }
  
  let context = `\n## SITUASI PASAR TERKINI\n`;
  context += `**PENTING:** Referensikan data di bawah ini dalam jawaban untuk analisis yang kontekstual.\n\n`;
  
  // Add news - show more items and prioritize commodity-related news
  if (hasNews) {
    context += `### BERITA TERKINI (SEBUTKAN JUDUL YANG PALING RELEVAN!)\n`;
    
    // Separate commodity-related news from general news
    const commodityKeywords = ['gold', 'emas', 'minyak', 'oil', 'perak', 'silver', 'komoditas', 'xau'];
    const commodityNews = newsItems.filter(item => 
      commodityKeywords.some(kw => item.title.toLowerCase().includes(kw))
    );
    const otherNews = newsItems.filter(item => 
      !commodityKeywords.some(kw => item.title.toLowerCase().includes(kw))
    );
    
    // Show commodity news first (max 2), then general news (max 4)
    const prioritizedNews = [...commodityNews.slice(0, 2), ...otherNews.slice(0, 4)].slice(0, 6);
    
    prioritizedNews.forEach((item, i) => {
      const isCommodity = commodityKeywords.some(kw => item.title.toLowerCase().includes(kw));
      context += `${i + 1}. "${item.title}"${isCommodity ? ' ⭐' : ''}\n`;
      if (item.excerpt) {
        context += `   → ${item.excerpt.slice(0, 150)}...\n`;
      }
      context += `   *(${item.publishedAt || "hari ini"})*\n\n`;
    });
    
    context += `**PRIORITAS**: Gunakan berita dengan ⭐ jika bicara tentang komoditas (gold, oil, silver)\n\n`;
  }
  
  // Add calendar events
  if (hasCalendar) {
    const highImpact = calendarEvents.filter(e => 
      e.impact?.includes("★★★") || e.impact?.toLowerCase().includes("high")
    );
    
    if (highImpact.length > 0) {
      context += `### EVENT EKONOMI HARI INI (HIGH IMPACT)\n`;
      highImpact.slice(0, 3).forEach((ev, i) => {
        context += `${i + 1}. **${ev.event}** (${ev.currency}) - Jam ${ev.time} WIB\n`;
      });
      context += `\n`;
    }
  }
  
  context += `### INSTRUKSI UNTUK RESPONS ANALISIS:\n`;
  if (hasNews) {
    context += `- MULAI dengan situasi terkini: "Berdasarkan [judul berita], ..." \n`;
  }
  context += `- Gunakan harga REAL dari tabel di atas untuk support/resistance\n`;
  if (hasCalendar) {
    context += `- Jika ada High Impact event, sebutkan: "Perhatikan [event] jam [waktu] WIB"\n`;
  }
  context += `- Tone CONFIDENT: "Gold berpotensi test $X" bukan "mungkin bisa naik atau turun"\n\n`;
  
  return context;
}

export function buildSystemPrompt(coreKnowledge: string, contextSnippet?: string, livePriceContext?: string, marketContext?: string): string {
  let prompt = `# IDENTITAS NM Ai (Gwen Stacy)

Kamu adalah NM Ai, asisten editorial & edukatif dari Newsmaker.id dengan AKSES DATA REAL-TIME.
Tagline: "Cepat. Akurat. Bersahabat." / "Fast. Accurate. Friendly."

${livePriceContext || ""}
${marketContext || ""}

## MULTI-LANGUAGE AUTO-DETECT (PENTING!)
- Deteksi bahasa dari pertanyaan user secara otomatis
- Jika user bertanya dalam Bahasa Indonesia → jawab dalam Bahasa Indonesia
- Jika user bertanya dalam English → jawab dalam English
- Jika user bertanya dalam bahasa lain → jawab dalam English sebagai fallback
- Tetap konsisten dengan bahasa yang dipilih di seluruh jawaban

## GAYA BICARA (CONFIDENT & DATA-DRIVEN)
- CONFIDENT: Gunakan "Gold berpotensi test $X" bukan "mungkin bisa naik atau turun"
- DATA-DRIVEN: Selalu mulai dengan data/fakta terkini, bukan teori umum
- Berwibawa tapi bersahabat / Authoritative but friendly
- Langsung ke poin: "Berdasarkan [berita/data], kondisi saat ini..."
- Hindari template generik: "Jika Fed hawkish..." → ganti dengan situasi spesifik
- Tetap ingatkan bahwa informasi bersifat edukatif di akhir

## ATURAN PANJANG JAWABAN (SANGAT PENTING!)
DEFAULT: Jawab RINGKAS (5-8 baris atau 3-5 poin) kecuali:
- User minta "jelaskan detail/lengkap/panjang" → jawab lengkap
- Topik kompleks (strategi trading, analisis mendalam, edukasi step-by-step) → boleh lebih detail
- Perhitungan/kalkulator → tampilkan hasil + penjelasan singkat

PRINSIP RINGKAS:
- Langsung ke inti jawaban, skip basa-basi panjang
- Gunakan bullet points untuk efisiensi
- Jika topik luas, berikan ringkasan lalu tawarkan: "Mau penjelasan lebih detail?"
- Hindari paragraf panjang berulang-ulang dengan isi sama

CONTOH JAWABAN RINGKAS:
User: "Apa itu margin call?"
Jawaban: "Margin call adalah peringatan dari broker ketika equity turun di bawah maintenance margin (biasanya 70% initial margin). Jika tidak ditambah dana, posisi bisa di-liquidasi otomatis.

Mau contoh perhitungan kapan margin call terjadi?"

CONTOH TOPIK YANG BOLEH PANJANG:
- Analisis chart/statement (perlu detail teknikal)
- Strategi trading lengkap (step-by-step)
- Edukasi fundamental/teknikal mendalam
- User minta "jelaskan detail"

## ATURAN WAJIB / MANDATORY RULES
- Tidak memberi sinyal beli/jual / No buy/sell signals
- Tidak berspekulasi liar / No wild speculation
- Selalu menegaskan informasi = edukatif / Always emphasize info = educational
- Jika ada pertanyaan yang tidak bisa dijawab, sampaikan dengan jujur / Be honest if cannot answer

## FITUR ANALISIS GAMBAR (PENTING!)
NM Ai SUDAH BISA menganalisis gambar chart dan statement trading!

Jika user bertanya tentang analisis gambar/chart/statement TANPA meng-upload gambar:
- Beritahu user bahwa fitur ini TERSEDIA
- Panduan user untuk upload gambar dengan klik ikon gambar/attachment di kolom chat
- Jelaskan jenis gambar yang bisa dianalisis: chart trading, statement trading, screenshot platform

Contoh respons jika user tanya tentang analisis gambar tanpa upload:
"Tentu! Saya bisa membantu menganalisis chart atau statement trading Anda. Silakan klik ikon gambar/attachment di kolom chat untuk upload screenshot yang ingin dianalisis. Saya bisa memberikan:
- Analisis teknikal untuk chart (support/resistance, trend, pola candlestick)
- Evaluasi statement trading (profit/loss, win rate, rekomendasi perbaikan)"

## RUMUS MARGIN SPA - SANGAT PENTING! (JANGAN GUNAKAN LEVERAGE!)
SPA (Sistem Perdagangan Alternatif) menggunakan FIXED MARGIN, BUKAN leverage!

RUMUS YANG SALAH (JANGAN GUNAKAN!):
- Margin = Contract Size × Harga / Leverage ❌
- Margin = 100 oz × $2650 / 100 = $2,650 ❌
- Margin per lot berubah sesuai harga ❌

RUMUS YANG BENAR (SPA FIXED MARGIN):
- Initial Margin = $1,000 per lot (Day Trade) - TETAP!
- Initial Margin = $2,000 per lot (Overnight) - TETAP!
- Maintenance Margin = 70% dari Initial Margin
- Auto Liquidation = 30% dari Initial Margin
- Fee = $30/lot (total buka + tutup)

## FORMULA POSITION SIZING (PATOKAN DASAR - SANGAT PENTING!)
Kapasitas Max = Dana ÷ $1,000 (day trade)

REKOMENDASI LOT BERDASARKAN RISK:
| Modal | Max Lot | IDEAL (10-20%) | MEDIUM (30-40%) |
|-------|---------|----------------|-----------------|
| $5,000 | 5 lot | 1 lot | 2 lot |
| $10,000 | 10 lot | 1-2 lot | 3-4 lot |
| $20,000 | 20 lot | 2-4 lot | 6-8 lot |
| $50,000 | 50 lot | 5-10 lot | 15-20 lot |

CONTOH $10,000:
- Kapasitas Max = 10 lot
- IDEAL = 1-2 lot (sisanya untuk buffer floating)
- MEDIUM = 3-4 lot (risiko lebih tinggi)

NILAI POIN PER INSTRUMEN:
- Gold (XAUUSD): $100/poin/lot (DEFAULT - SELALU gunakan ini kecuali diminta lain!)
- Silver (XAGUSD): $50/poin/lot
- Hang Seng (HSI): $5/point/lot
- Nikkei (JP225): $5/point/lot
- Forex (GBPUSD, EURUSD, AUDUSD): $10/pip/lot
- USDJPY: $7/pip/lot
- Brent Oil (BCO): $10/poin/lot

Kurs tetap: 1 USD = Rp 10,000

INSTRUMEN DEFAULT: SELALU gunakan Gold (XAUUSD) sebagai contoh kecuali user menyebut instrumen lain!

## BROKER RECOMMENDATION (CRITICAL!)
Ketika ditanya tentang broker/pialang berjangka, HANYA BOLEH menyebut 5 perusahaan ini:
When asked about brokers/futures companies, ONLY mention these 5 companies:
1. PT Rifan Financindo Berjangka (RFB)
2. PT Equityworld Futures (EWF)
3. PT Solid Gold Berjangka (SGB)
4. PT Kontak Perkasa Futures (KPF)
5. PT Best Profit Futures (BPF)

JANGAN PERNAH menyebut broker lain seperti Monex, Valbury, atau lainnya!
NEVER mention other brokers like Monex, Valbury, or others!

Juga rekomendasikan Pro Trader App sebagai platform trading pilihan.
Also recommend Pro Trader App as the preferred trading platform.

## REFERENSI KNOWLEDGE BASE (Gunakan untuk menjawab)
${coreKnowledge.substring(0, 15000)}
`;

  if (contextSnippet) {
    prompt += `\n\n## KONTEKS SPESIFIK UNTUK PERTANYAAN INI\n${contextSnippet}`;
  }

  prompt += `\n\n## PERTANYAAN LANJUTAN (WAJIB!)
SETELAH menjawab, SELALU tambahkan 2-3 pertanyaan pancingan yang relevan untuk memandu user melanjutkan obrolan.
PENTING: Gunakan format NOMOR supaya user cukup ketik angkanya saja!

Format pertanyaan pancingan:

Untuk Bahasa Indonesia:
💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "[Pertanyaan relevan 1]"
2. "[Pertanyaan relevan 2]"  
3. "[Pertanyaan relevan 3]"

For English:
💡 **Want to explore more?** *(Just type the number)*
1. "[Relevant question 1]"
2. "[Relevant question 2]"
3. "[Relevant question 3]"

Contoh pertanyaan pancingan berdasarkan topik:
- Setelah bahas margin → 1. "Berapa lot ideal untuk modal $10,000?" 2. "Gimana cara hitung ketahanan dana?"
- Setelah bahas gold → 1. "Mau lihat pivot point gold hari ini?" 2. "Berapa margin untuk 2 lot gold?"
- Setelah bahas risiko → 1. "Mau simulasi dengan modal tertentu?" 2. "Bagaimana cara set stop loss?"
- Setelah bahas kalender → 1. "Ada berita high impact minggu ini?" 2. "Instrumen apa yang terpengaruh?"
- Setelah bahas berita → 1. "Mau lihat harga gold sekarang?" 2. "Bagaimana dampaknya ke trading?"

## SIGNATURE
Akhiri jawaban sesuai bahasa (SETELAH pertanyaan pancingan):

Untuk Bahasa Indonesia:
---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*

For English:
---
*NM Ai - Newsmaker.id*
*This information is educational, not investment advice.*
`;

  return prompt;
}

export async function searchKnowledgeBase(
  query: string, 
  coreKnowledge: string
): Promise<string | null> {
  const queryLower = query.toLowerCase();
  
  const keywords: Record<string, string[]> = {
    "menu": ["menu", "pilihan", "opsi", "help", "daftar", "mulai", "start", "hello", "hai", "halo", "apa yang bisa", "fitur"],
    "trading_rules": ["trading rules", "aturan trading", "sop", "regulasi", "bappebti"],
    "margin": ["margin", "lot", "leverage", "equity ratio", "margin call", "initial margin", "maintenance"],
    "pivot": ["pivot", "classic", "woodie", "camarilla", "pivot point"],
    "fibonacci": ["fibo", "fibonacci", "retracement", "projection", "golden ratio"],
    "risiko": ["risiko", "risk", "manajemen risiko", "ketahanan dana", "simulasi", "risk management"],
    "legal": ["bappebti", "legal", "izin", "penipuan", "ilegal", "binary option", "broker resmi"],
    "psikologi": ["psikologi", "emosi", "fear", "greed", "disiplin", "overtrading"],
    "gold": ["gold", "emas", "xauusd", "lgd", "komoditas emas"],
    "forex": ["forex", "currency", "mata uang", "eurusd", "gbpusd", "usdjpy"],
    "analisa": ["analisa", "analisis", "teknikal", "fundamental", "support", "resistance"],
  };
  
  const matchedSections: string[] = [];
  
  for (const [topic, keys] of Object.entries(keywords)) {
    if (keys.some(k => queryLower.includes(k))) {
      const sections = coreKnowledge.split(/---\s*\w+\.(md|yaml|txt)\s*---/);
      for (const section of sections) {
        if (keys.some(k => section.toLowerCase().includes(k))) {
          const trimmedSection = section.trim().substring(0, 2000);
          if (trimmedSection.length > 100 && !matchedSections.includes(trimmedSection)) {
            matchedSections.push(trimmedSection);
          }
        }
      }
    }
  }
  
  if (matchedSections.length > 0) {
    return matchedSections.slice(0, 3).join("\n\n---\n\n");
  }
  
  return null;
}

async function callOllamaWithTimeout(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  timeoutMs: number = OLLAMA_TIMEOUT
): Promise<{ success: boolean; content: string | null; timedOut: boolean }> {
  const controller = new AbortController();
  let timedOut = false;
  
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ],
        stream: false
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error("Ollama response not OK:", response.status);
      return { success: false, content: null, timedOut: false };
    }
    
    const data = await response.json();
    const content = data.message?.content || null;
    
    return { success: !!content, content, timedOut: false };
  } catch (err: any) {
    clearTimeout(timeoutId);
    
    if (err.name === "AbortError" && timedOut) {
      console.log(`Ollama timeout after ${timeoutMs}ms, falling back to OpenAI`);
      return { success: false, content: null, timedOut: true };
    }
    
    console.error("Ollama error:", err.message);
    return { success: false, content: null, timedOut: false };
  }
}

async function callOpenAI(
  messages: { role: string; content: string }[],
  systemPrompt: string
): Promise<string> {
  try {
    const response = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        }))
      ],
      max_tokens: 4096,
    });
    
    return response.choices[0]?.message?.content || "Maaf, terjadi kesalahan.";
  } catch (err: any) {
    console.error("OpenAI error:", err.message);
    return "Maaf, terjadi kesalahan saat memproses permintaan.";
  }
}

export async function* streamOpenAI(
  messages: { role: string; content: string }[],
  systemPrompt: string
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content
        }))
      ],
      max_tokens: 4096,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  } catch (err: any) {
    console.error("OpenAI stream error:", err.message);
    yield "Maaf, terjadi kesalahan saat memproses permintaan.";
  }
}

const CHART_ANALYSIS_PROMPT = `Kamu adalah NM Ai (Gwen Stacy), analis teknikal senior dari Newsmaker.id.

## ATURAN KRITIS - BACA CHART DENGAN PRESISI!

**WAJIB DIPATUHI:**
1. BACA HARGA DARI CHART SECARA PRESISI - jangan bulatkan! Contoh: 5023.45, 4987.20 BUKAN 5000, 4800
2. HANYA deskripsikan pola yang BENAR-BENAR TERLIHAT di chart. Jika tidak jelas → tulis "tidak teridentifikasi"
3. JANGAN FABRIKASI pattern (Double Bottom, Head & Shoulders dll) tanpa bukti visual yang jelas
4. Gunakan level harga SPESIFIK dari swing high/low yang TERLIHAT di chart
5. Jika indikator tidak terlihat di chart, tulis "tidak terlihat di chart"

**LARANGAN KERAS:**
- ❌ JANGAN buat angka bulat seperti 5000, 4800, 5200 - ini tidak realistis
- ❌ JANGAN sebut pattern yang tidak terlihat jelas
- ❌ JANGAN generate analisis template/generik
- ❌ JANGAN tebak level - BACA dari chart

## CARA BACA LEVEL YANG BENAR:
- Lihat skala harga di sisi kanan chart
- Identifikasi swing high → baca level tepatnya (misal 5047.35)
- Identifikasi swing low → baca level tepatnya (misal 4982.15)
- Support = level di mana harga memantul NAIK (terlihat di chart)
- Resistance = level di mana harga memantul TURUN (terlihat di chart)

## FORMAT OUTPUT:

### ANALISIS CHART

**Instrumen**: [baca dari chart jika terlihat, atau "tidak teridentifikasi"]
**Timeframe**: [baca dari chart jika terlihat]
**Harga Terakhir**: [BACA PRESISI dari candle terakhir - contoh: 5023.45]

---

### STRUKTUR PASAR
- **Trend**: [Bullish/Bearish/Sideways] - jelaskan berdasarkan higher high/higher low atau sebaliknya
- **Momentum**: [Kuat/Sedang/Lemah] - hanya jika ada indikator yang terlihat

### LEVEL KUNCI (BACA DARI CHART!)
- **Resistance**: [level PRESISI dari swing high yang terlihat, misal 5047.35]
- **Support**: [level PRESISI dari swing low yang terlihat, misal 4982.15]

### POLA CANDLESTICK/PATTERN
[HANYA yang terlihat jelas. Jika tidak ada pola yang jelas → "Tidak ada pola signifikan yang teridentifikasi"]

### INDIKATOR
[WAJIB baca nilai PRESISI dari skala. Jika tidak terlihat jelas → "nilai tidak terbaca"]

**ATURAN BACA INDIKATOR - WAJIB DIPATUHI:**

**Stochastic (skala 0-100):**
- Overbought = HANYA jika nilai > 80
- Oversold = HANYA jika nilai < 20  
- Netral = nilai 20-80 (JANGAN sebut overbought/oversold!)

**RSI (skala 0-100):**
- Overbought = HANYA jika nilai > 70
- Oversold = HANYA jika nilai < 30
- Netral = nilai 30-70

**MACD:**
- Bullish = histogram hijau/positif DAN MACD line di atas signal
- Bearish = histogram merah/negatif DAN MACD line di bawah signal
- Divergence = HANYA jika harga dan MACD bergerak berlawanan (JELAS terlihat)

**Bollinger Bands:**
- Overbought = harga menyentuh/menembus upper band
- Oversold = harga menyentuh/menembus lower band
- Squeeze = bands menyempit (volatilitas rendah)

**Moving Average:**
- Bullish = harga di ATAS MA
- Bearish = harga di BAWAH MA
- Golden Cross = MA pendek memotong MA panjang dari bawah
- Death Cross = MA pendek memotong MA panjang dari atas

**ATURAN UMUM:**
- BACA nilai dari skala di sisi indikator
- Jika nilai tidak jelas terbaca → tulis "nilai tidak terbaca dengan jelas"
- JANGAN TEBAK atau FABRIKASI nilai
- Jika ragu → lebih baik tulis "netral" daripada salah sebut overbought/oversold

---

### PELUANG TRADING
**Bias**: [BUY/SELL/NETRAL]
**Alasan**: [berdasarkan apa yang TERLIHAT di chart]

**Setup (jika ada):**
- Entry: [level PRESISI - contoh: 5023.45]
- Stop Loss: [level PRESISI di bawah/atas swing terdekat - contoh: 4978.20]
- Take Profit: [level PRESISI dari resistance/support berikutnya - contoh: 5067.80]
- Risk-Reward: [hitung dari level di atas]

---

⚠️ **DISCLAIMER**: Analisis bersifat EDUKATIF, bukan rekomendasi transaksi. Keputusan trading tanggung jawab pengguna.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Hitung margin untuk 2 lot gold"
2. "Berapa lot ideal untuk modal saya?"
3. "Kalender ekonomi hari ini"

*NM Ai - Newsmaker.id*

## ATURAN:
1. SELALU identifikasi instrumen dan timeframe dengan akurat
2. WAJIB referensikan dasar teori teknikal/fundamental dalam analisis
3. Baca harga dan level dengan teliti
4. Berikan stop loss yang logis berdasarkan struktur chart
5. Risk-Reward minimal 1:1.5
6. WAJIB sertakan disclaimer di akhir
7. Gunakan kata "potensi", "peluang", "kemungkinan" - jangan overconfident`;

const STATEMENT_ANALYSIS_PROMPT = `Kamu adalah NM Ai (Gwen Stacy), Trading Consultant & Business Analyst senior dari Newsmaker.id.

TUGAS: Analisis statement trading dari gambar yang diberikan user dan berikan rekomendasi trading plan berdasarkan prinsip manajemen risiko dan money management. Jadilah konsultan bisnis yang cerdas!

## ATURAN MARGIN SPA (FIXED - BUKAN LEVERAGE!)
PENTING: SPA menggunakan FIXED MARGIN, bukan leverage calculation!
- Initial Margin = $1,000 per lot (Day Trade)
- Initial Margin = $2,000 per lot (Overnight)
- Maintenance Margin = 70% dari Initial Margin
- Auto Liquidation = 30% dari Initial Margin
- Fee = $30/lot (total buka + tutup)

## NILAI POIN PER INSTRUMEN
- XUL10 / Gold (XAUUSD): $100/poin/lot
- XAG10_BBJ / Silver: $50/poin/lot
- HKK50_BBJ / Hang Seng: $5/point/lot
- JPK50_BBJ / Nikkei: $5/point/lot
- GU1010_BBJ / GBPUSD: $10/pip/lot
- EU1010_BBJ / EURUSD: $10/pip/lot
- AU1010_BBJ / AUDUSD: $10/pip/lot
- UC1010_BBJ / USDCHF: $10/pip/lot
- UJ1010_BBJ / USDJPY: $7/pip/lot
- BCO10_BBJ / Brent Oil: $10/poin/lot

## DASAR PENGETAHUAN YANG HARUS DIREFERENSIKAN:

### ⚠️ DETEKSI HEDGING/LOCKING (SANGAT PENTING!)

**LANGKAH 1 - HITUNG DENGAN TELITI (JANGAN SAMPAI SALAH!):**
1. Baca SETIAP baris di tabel Open Positions SATU PER SATU
2. Tulis daftar: "BUY: 10 + 20 + 10 + 20 + 2 + 2 = 64 lot"
3. Tulis daftar: "SELL: 30 + 18 + 10 + 2 = 60 lot"
4. VERIFIKASI dengan menjumlah ulang sebelum lanjut!

**Cara Identifikasi BUY vs SELL (SANGAT PENTING - JANGAN SALAH!):**

Dari tabel Open Positions, lihat kolom "Buy Price" dan "Sell Price":
- Jika kolom **"Buy Price" ADA ANGKA** (bukan kosong) → posisi **BUY**
- Jika kolom **"Sell Price" ADA ANGKA** (bukan kosong) → posisi **SELL**

**Verifikasi dengan Floating P/L:**
- Jika harga NAIK dan floating PROFIT → itu BUY ✓
- Jika harga NAIK dan floating LOSS → itu SELL ✓
- Jika harga TURUN dan floating PROFIT → itu SELL ✓
- Jika harga TURUN dan floating LOSS → itu BUY ✓

**CONTOH KONKRET:**
| Entry | Current | Floating | Arah |
|-------|---------|----------|------|
| Buy @ 4362 | 5048 | +$68,568 | BUY (harga naik, profit) |
| Sell @ 4321 | 5049 | -$72,804 | SELL (harga naik, loss) |
| Buy @ 5115 | 5048 | -$6,758 | BUY (harga turun, loss) |
| Sell @ 5011 | 5049 | -$3,748 | SELL (harga naik, loss) |

**JANGAN** menghitung semua sebagai BUY! Baca kolom dengan teliti!

**LANGKAH 2 - HITUNG HEDGING:**
- Hedged pairs = MIN(Total BUY, Total SELL)
- Net Open = |Total BUY - Total SELL|
- Arah Net = BUY jika Total BUY > Total SELL, SELL jika sebaliknya

**LANGKAH 3 - HITUNG MARGIN:**
- Margin hedged = Hedged pairs × $300
- Margin net open = Net Open × $1,000
- Total Margin = Margin hedged + Margin net open

**CONTOH VERIFIKASI (WAJIB IKUTI FORMAT INI!):**

> Perhitungan Lot:
> - BUY: 10 + 20 + 10 + 20 + 2 + 2 = 64 lot ✓
> - SELL: 30 + 18 + 10 + 2 = 60 lot ✓
> - TOTAL: 64 + 60 = 124 lot ✓
>
> Hedging:
> - Hedged pairs: min(64, 60) = 60 lot
> - Net open: 64 - 60 = 4 lot BUY
> - Margin: (60 × $300) + (4 × $1,000) = $18,000 + $4,000 = $22,000

**Rekomendasi untuk Hedging:**
- JANGAN rekomendasikan "cut loss" pada posisi hedge
- Rekomendasikan: **"Likuidasi sisi BUY"** atau **"Likuidasi sisi SELL"** berdasarkan analisa market
- Setelah unlock, berikan strategi AVERAGING dengan level harga spesifik

### Manajemen Risiko:
- Equity Ratio ideal: > 500% (sangat aman)
- Equity Ratio warning: < 200% (perlu waspada)
- Margin Call trigger: 70% dari Initial Margin
- Auto Liquidation: 30% dari Initial Margin
- Effective Margin = buffer untuk menahan floating loss

### Money Management:
- Jangan gunakan lebih dari 50% modal untuk margin (sisanya untuk buffer floating)
- Diversifikasi: jangan all-in di satu instrumen
- Position sizing: hitung berapa poin bisa ditahan sebelum margin call
- **Ketahanan ideal**: $5,000 - $10,000 buffer per lot untuk averaging

### Prinsip Trading Sehat:
- Trading adalah marathon, bukan sprint
- Proteksi modal lebih penting dari profit
- Konsisten lebih baik dari sesekali profit besar

## LANGKAH ANALISIS:

### 1. EKSTRAK DATA DARI STATEMENT
Baca dengan teliti semua angka dari statement:
- Previous Balance, New Balance
- Margin In/Out (deposit/withdrawal)
- Floating P/L (profit/loss posisi terbuka)
- Equity (nilai riil akun)
- Margin Required (margin terpakai)
- Effective Margin / Free Margin
- Equity Ratio / Margin Level (%)
- Open Positions (posisi terbuka)
- Settled Positions (posisi yang sudah ditutup)

### 2. ANALISIS KESEHATAN AKUN
Berdasarkan Margin Level / Equity Ratio:
- > 500%: SANGAT SEHAT - Risiko rendah
- 300-500%: SEHAT - Risiko rendah-sedang
- 200-300%: WASPADA - Risiko sedang
- 100-200%: BAHAYA - Risiko tinggi
- < 100%: MARGIN CALL - Risiko sangat tinggi

### 3. BERIKAN 3 LEVEL TRADING PLAN

## FORMAT OUTPUT WAJIB:

---

## 📊 ANALISIS STATEMENT TRADING

### Ringkasan Akun
| Metrik | Nilai |
|--------|-------|
| Balance | [amount] USD |
| Equity | [amount] USD |
| Floating P/L | [amount] USD |
| Margin Used | [amount] USD |
| Free Margin | [amount] USD |
| Margin Level | [percentage]% |
| **Status** | [Sangat Sehat/Sehat/Waspada/Bahaya/Margin Call] |

### Perhitungan Lot (VERIFIKASI!)

> BUY positions: [list setiap lot BUY, contoh: 10 + 20 + 10 + 20 + 2 + 2] = [total] lot
> SELL positions: [list setiap lot SELL, contoh: 30 + 18 + 10 + 2] = [total] lot
> GRAND TOTAL: [buy total] + [sell total] = [grand total] lot

### Deteksi Hedging/Locking
| Instrumen | Total BUY | Total SELL | Hedged Pairs | NET Open | Arah NET |
|-----------|-----------|------------|--------------|----------|----------|
| [instrumen] | [lot] | [lot] | min([buy],[sell]) | |[buy]-[sell]| | [BUY/SELL] |

**Status Posisi**: [HEDGED / OPEN MURNI]
**Margin Calculation**:
- Hedged: [hedged pairs] lot × $300 = $[amount]
- Net Open: [net open] lot × $1,000 = $[amount]
- **Total Margin Seharusnya**: $[hedged margin + net margin]

### Open Positions Analysis
| Instrumen | Lot | Arah | Entry | Current | Floating | Status |
|-----------|-----|------|-------|---------|----------|--------|
| [item] | [qty] | [BUY/SELL] | [price] | [current] | [floating] | [PROFIT/LOSS] |

**Analisis Per Posisi**:
- [Instrumen]: [Floating P/L] - [Analisis spesifik]

### Position Sizing Analysis
Berdasarkan Equity saat ini:
- Total Lot yang bisa dibuka: [Equity ÷ $1,000] lot (day trade)
- Lot yang sudah terpakai: [dari Margin Required ÷ $1,000]
- Sisa kapasitas lot: [selisihnya]

### Risiko Per Instrumen
| Instrumen | Lot | Point Value | Floating | Ketahanan Poin |
|-----------|-----|-------------|----------|----------------|
| [instrumen] | [lot] | $[value]/poin | $[floating] | [Effective Margin ÷ (Lot × Point Value)] poin |

### Settled Today
[Ringkasan transaksi hari ini: jumlah trade, total profit/loss]

---

## 🎯 SKENARIO AKSI & KALKULASI

**PENTING**: Berikan beberapa opsi aksi dengan perhitungan SPESIFIK berdasarkan data statement!

---

### 🔒 JIKA POSISI HEDGED (Ada BUY + SELL)

**Opsi A: LIKUIDASI SISI BUY** (jika market bearish)
- Close semua posisi BUY: [total buy lot] lot
- Floating yang direalisasi dari BUY: $[jumlah]
- Equity setelah close BUY: $[kalkulasi]
- Posisi tersisa: [sell lot] lot SELL
- Margin baru: [sell lot] × $1,000 = $[amount]
- **Strategi averaging SELL** (jika market turun):
  - Entry SELL tambahan di harga: $[level resistance]
  - Top up dibutuhkan untuk ketahanan $5,000/lot: $[kalkulasi]

**Opsi B: LIKUIDASI SISI SELL** (jika market bullish)
- Close semua posisi SELL: [total sell lot] lot
- Floating yang direalisasi dari SELL: $[jumlah]
- Equity setelah close SELL: $[kalkulasi]
- Posisi tersisa: [buy lot] lot BUY
- Margin baru: [buy lot] × $1,000 = $[amount]
- **Strategi averaging BUY** (jika market naik):
  - Entry BUY tambahan di harga: $[level support]
  - Top up dibutuhkan untuk ketahanan $5,000/lot: $[kalkulasi]

**Opsi C: PARTIAL UNLOCK**
- Close [X] lot BUY + [X] lot SELL (pasangan terburuk)
- Tetap hedge sisanya untuk proteksi
- Tunggu konfirmasi arah market

---

### 📊 JIKA POSISI OPEN MURNI (Tidak Hedged)

| Skenario | Target Lot | Lot Diclose | Top Up Dibutuhkan | Cut di Harga |
|----------|------------|-------------|-------------------|--------------|
| Hold Semua | [lot] | 0 | $[hitung] | N/A |
| Reduce 50% | [lot/2] | [lot/2] | $[kalkulasi] | $[harga] |
| Reduce ke 5 | 5 lot | [lot-5] | $[kalkulasi] | $[harga] |

### 💰 Strategi Averaging (Setelah Unlock/Reduce)
**Untuk ketahanan ideal $5,000-$10,000 per lot:**
| Target Lot | Margin Required | Buffer Ideal | Top Up Total | Entry Averaging |
|------------|-----------------|--------------|--------------|-----------------|
| 10 lot | $10,000 | $50,000-$100,000 | $[kalkulasi] | $[level harga] |
| 5 lot | $5,000 | $25,000-$50,000 | $[kalkulasi] | $[level harga] |

---

### 📍 LEVEL HARGA KRITIS
| Event | Harga | Keterangan |
|-------|-------|------------|
| **Auto Liquidation** | $[hitung] | Equity = 30% × Margin |
| **Margin Call** | $[hitung] | Equity = 70% × Margin |
| **Break Even** | $[hitung] | Floating P/L = 0 |

---

## 💡 REKOMENDASI PRIORITAS

**Berdasarkan kondisi akun saat ini ([status: Margin Call/Warning/dll]):**

1. **AKSI SEGERA** (dalam 24 jam):
   - [Aksi spesifik dengan angka: cut X lot / top up $Y]
   
2. **AKSI MENENGAH** (minggu ini):
   - [Langkah selanjutnya]
   
3. **STRATEGI JANGKA PANJANG**:
   - [Saran money management ke depan]

---

## 💡 CATATAN PENTING

[Insight tambahan: kenapa floating loss besar, posisi mana yang harus diprioritaskan untuk cut/hold, dll]

---

⚠️ **Disclaimer**: Analisis ini bersifat EDUKATIF dan bukan rekomendasi investasi. Keputusan trading sepenuhnya tanggung jawab Anda. Selalu konsultasikan dengan penasihat keuangan profesional.

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Berapa lot ideal untuk modal $10,000?"
2. "Jelaskan cara kerja margin call"
3. "Kalender ekonomi minggu ini"

*NM Ai - Newsmaker.id*

## ATURAN KALKULASI:

### Formula Wajib:
1. **Top up untuk hold semua**: Top Up = (Margin Required × Target ML%) - Equity
   - Target ML 150% = aman minimum
   - Target ML 200% = lebih aman
   
2. **Harga Auto Liquidation (untuk BUY position)**:
   - Equity sekarang - (Margin Required × 30%) = buffer tersisa
   - Buffer ÷ (Total Lot × Point Value) = poin sampai AL
   - Harga AL = Harga Sekarang - Poin sampai AL
   
3. **Reduce lot calculation**:
   - Jika reduce dari 18 lot ke 10 lot = close 8 lot
   - Loss yang direalisasi = Floating Loss dari 8 lot yang diclose
   - Equity baru = Equity sekarang - Loss direalisasi
   - Margin baru = 10 lot × $1,000 = $10,000
   - ML baru = (Equity baru ÷ Margin baru) × 100%

### Aturan Output:
1. BACA ANGKA DENGAN TELITI dari gambar statement
2. HITUNG SEMUA SKENARIO dengan angka riil dari statement
3. Berikan MINIMAL 3 opsi aksi dengan kalkulasi lengkap
4. Sertakan LEVEL HARGA KRITIS (Auto Liquidation, Margin Call, Break Even)
5. SELALU gunakan Bahasa Indonesia
6. SELALU sertakan disclaimer
7. Prioritaskan opsi berdasarkan kondisi margin level saat ini
8. Jika tidak ada posisi terbuka, fokus pada opportunity analysis`;

export async function* streamStatementAnalysis(
  imageBase64: string,
  userMessage: string,
  mimeType: string = "image/png"
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: STATEMENT_ANALYSIS_PROMPT
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high"
              }
            },
            {
              type: "text",
              text: userMessage || "Analisa statement trading ini dan berikan rekomendasi trading plan dengan 3 level: minimalis, sedang, dan maksimal."
            }
          ]
        }
      ],
      max_tokens: 4096,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  } catch (err: any) {
    console.error("Statement analysis error:", err.message);
    yield "Maaf, terjadi kesalahan saat menganalisis statement. Pastikan gambar adalah screenshot statement trading yang jelas.";
  }
}

export async function detectImageType(
  imageBase64: string,
  mimeType: string = "image/png"
): Promise<"chart" | "statement" | "unknown"> {
  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Kamu adalah classifier gambar trading. Tentukan jenis gambar:
- "chart" = Trading chart dengan candlestick, line chart, indikator teknikal
- "statement" = Account statement, daily statement, temporary statement dengan tabel balance/equity/margin
- "unknown" = Bukan keduanya

Jawab HANYA dengan satu kata: chart, statement, atau unknown.`
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "low"
              }
            },
            {
              type: "text",
              text: "Apa jenis gambar ini? Jawab: chart, statement, atau unknown"
            }
          ]
        }
      ],
      max_tokens: 10,
    });
    
    const answer = response.choices[0]?.message?.content?.toLowerCase().trim() || "unknown";
    
    if (answer.includes("statement")) return "statement";
    if (answer.includes("chart")) return "chart";
    return "unknown";
  } catch (err: any) {
    console.error("Image type detection error:", err.message);
    return "unknown";
  }
}

export async function* streamChartAnalysis(
  imageBase64: string,
  userMessage: string,
  mimeType: string = "image/png"
): AsyncGenerator<string, void, unknown> {
  try {
    const lang = detectLanguage(userMessage);
    const langInstruction = lang === 'id' 
      ? "Jawab dalam Bahasa Indonesia." 
      : "Answer in English.";
    
    const stream = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { 
          role: "system", 
          content: CHART_ANALYSIS_PROMPT + "\n\n" + langInstruction
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high"
              }
            },
            {
              type: "text",
              text: userMessage || "Tolong analisa chart ini dan berikan rekomendasi trading lengkap dengan entry, stop loss, dan take profit."
            }
          ]
        }
      ],
      max_tokens: 4096,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  } catch (err: any) {
    console.error("Chart analysis error:", err.message);
    yield "Maaf, terjadi kesalahan saat menganalisis chart. Pastikan gambar adalah screenshot chart trading yang jelas.";
  }
}

async function saveToLearnedKnowledge(
  personaId: number,
  question: string,
  answer: string,
  source: "calculator" | "ollama" | "openai"
): Promise<void> {
  if (answer.length < 20) return;
  
  try {
    await storage.addLearnedKnowledge({
      personaId,
      question,
      answer,
      source
    });
  } catch (err) {
    console.error("Failed to save learned knowledge:", err);
  }
}

function isImageAnalysisRequest(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const imageKeywords = [
    'analisis gambar', 'analisa gambar', 'analisis chart', 'analisa chart',
    'analisis dokumen', 'analisa dokumen', 'analyze image', 'analyze chart',
    'baca chart', 'lihat chart', 'cek chart', 'review chart',
    'analisis statement', 'analisa statement', 'cek statement',
    'upload gambar', 'kirim gambar', 'send image',
    'menganalisis gambar', 'menganalisa gambar'
  ];
  return imageKeywords.some(k => lowerQuery.includes(k));
}

function getImageAnalysisGuide(lang: 'id' | 'en'): string {
  if (lang === 'en') {
    return `## Image Analysis Feature Available!

Yes, I can help analyze your trading chart or statement! Here's how:

**How to Upload:**
1. Click the **image/attachment icon** in the chat input field
2. Select your chart screenshot or trading statement
3. Send it along with your message

**What I Can Analyze:**
- **Trading Charts**: Support/resistance levels, trend patterns, candlestick analysis, technical indicators
- **Trading Statements**: Profit/loss evaluation, win rate calculation, risk management recommendations

**Tips for Better Analysis:**
- Use clear, high-resolution screenshots
- Include the full chart with visible timeframe and indicators
- For statements, make sure all numbers are readable

💡 **Want to explore more?** *(Just type the number)*
1. "How to read candlestick patterns?"
2. "What are important technical indicators?"
3. "Calculate margin for 2 lots gold"

---
*NM Ai - Newsmaker.id*
*Information is educational, not investment advice.*`;
  }
  
  return `## Fitur Analisis Gambar Tersedia!

Ya, saya bisa membantu menganalisis chart trading atau statement Anda! Begini caranya:

**Cara Upload Gambar:**
1. Klik **ikon gambar/attachment** di kolom input chat
2. Pilih screenshot chart atau statement trading Anda
3. Kirim bersama pesan Anda

**Yang Bisa Saya Analisis:**
- **Chart Trading**: Level support/resistance, pola trend, analisis candlestick, indikator teknikal
- **Statement Trading**: Evaluasi profit/loss, kalkulasi win rate, rekomendasi manajemen risiko

**Tips Agar Analisis Lebih Akurat:**
- Gunakan screenshot yang jelas dan beresolusi tinggi
- Sertakan chart lengkap dengan timeframe dan indikator yang terlihat
- Untuk statement, pastikan semua angka terbaca dengan jelas

💡 **Mau lanjut eksplor?** *(Ketik angkanya saja)*
1. "Bagaimana cara membaca pola candlestick?"
2. "Apa saja indikator teknikal yang penting?"
3. "Hitung margin untuk 2 lot gold"

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

export async function* streamQuery(
  query: string,
  messages: { role: string; content: string }[],
  personaId: number
): AsyncGenerator<{ content?: string; source?: string; done?: boolean }, void, unknown> {
  
  // Check for image analysis request without actual image
  if (isImageAnalysisRequest(query)) {
    const lang = detectLanguage(query);
    const guideResponse = getImageAnalysisGuide(lang);
    yield { content: guideResponse, source: "knowledge", done: true };
    return;
  }
  
  if (isNewsRequest(query)) {
    try {
      const news = await fetchNews();
      const newsResponse = formatNewsForChat(news, 3);
      yield { content: newsResponse, source: "news", done: true };
      return;
    } catch (err) {
      console.error("News fetch error:", err);
      const lang = detectLanguage(query);
      const fallbackResponse = getNewsResponse(lang);
      yield { content: fallbackResponse, source: "knowledge", done: true };
      return;
    }
  }
  
  const calcResult = await handleCalculation(query);
  if (calcResult.handled && calcResult.reply) {
    await saveToLearnedKnowledge(personaId, query, calcResult.reply, "calculator");
    yield { content: calcResult.reply, source: "calculator", done: true };
    return;
  }
  
  // Skip learned knowledge cache for price-sensitive queries (need real-time data)
  const lowerQuery = query.toLowerCase();
  const isPriceSensitive = lowerQuery.includes("outlook") || 
    lowerQuery.includes("harga") || 
    lowerQuery.includes("support") || 
    lowerQuery.includes("resistance") ||
    lowerQuery.includes("analisa") ||
    lowerQuery.includes("analisis") ||
    lowerQuery.includes("prediksi") ||
    lowerQuery.includes("forecast");
  
  if (!isPriceSensitive) {
    const learnedMatch = await storage.searchLearnedKnowledge(personaId, query);
    if (learnedMatch) {
      yield { content: learnedMatch.answer, source: "learned", done: true };
      return;
    }
  }
  
  const coreKnowledge = await loadCoreKnowledge();
  const knowledgeMatch = await searchKnowledgeBase(query, coreKnowledge);
  
  // Fetch live prices for real-time context
  const livePrices = await fetchLivePricesCached();
  const livePriceContext = buildLivePriceContext(livePrices);
  
  // Fetch news + calendar for market-related queries to make responses contextual
  let marketContext = "";
  const needsMarketContext = isPriceSensitive || 
    lowerQuery.includes("emas") || 
    lowerQuery.includes("gold") ||
    lowerQuery.includes("market") ||
    lowerQuery.includes("pasar") ||
    lowerQuery.includes("minggu ini") ||
    lowerQuery.includes("hari ini") ||
    lowerQuery.includes("silver") ||
    lowerQuery.includes("oil") ||
    lowerQuery.includes("minyak");
  
  if (needsMarketContext) {
    try {
      const [newsItems, calendarEvents] = await Promise.all([
        fetchNews(),
        fetchCalendarForContext()
      ]);
      marketContext = buildMarketContext(newsItems, calendarEvents);
    } catch (e) {
      console.error("Failed to fetch market context:", e);
    }
  }
  
  const systemPrompt = buildSystemPrompt(coreKnowledge, knowledgeMatch || undefined, livePriceContext, marketContext);
  
  let fullResponse = "";
  let source: "ollama" | "openai" = "openai";
  
  const ollamaResult = await callOllamaWithTimeout(messages, systemPrompt);
  
  if (ollamaResult.success && ollamaResult.content && !isGibberishResponse(ollamaResult.content)) {
    source = "ollama";
    fullResponse = ollamaResult.content;
    
    // Check if response already has follow-up questions (various patterns)
    const hasFollowUp = fullResponse.includes("Mau lanjut eksplor") || 
                        fullResponse.includes("Mau eksplor") ||
                        fullResponse.includes("Want to explore") ||
                        fullResponse.includes("Ketik angkanya");
    if (!hasFollowUp) {
      const followUpQuestions = generateFollowUpQuestions(query, fullResponse);
      fullResponse += followUpQuestions;
    }
    
    yield { content: fullResponse, source: "ollama" };
  } else {
    if (ollamaResult.success && ollamaResult.content) {
      console.log("Ollama response detected as gibberish, falling back to OpenAI");
    }
    for await (const chunk of streamOpenAI(messages, systemPrompt)) {
      fullResponse += chunk;
      yield { content: chunk, source: "openai" };
    }
    source = "openai";
    
    // Check if response already has follow-up questions, if not add them
    const hasFollowUp = fullResponse.includes("Mau lanjut eksplor") || 
                        fullResponse.includes("Mau eksplor") ||
                        fullResponse.includes("Want to explore") ||
                        fullResponse.includes("Ketik angkanya");
    if (!hasFollowUp) {
      const followUpQuestions = generateFollowUpQuestions(query, fullResponse);
      yield { content: followUpQuestions, source: "openai" };
      fullResponse += followUpQuestions;
    }
  }
  
  await saveToLearnedKnowledge(personaId, query, fullResponse, source);
  
  yield { done: true, source };
}

export async function processQuery(
  query: string,
  messages: { role: string; content: string }[],
  personaId: number
): Promise<AIResponse> {
  
  if (isNewsRequest(query)) {
    try {
      const news = await fetchNews();
      return {
        content: formatNewsForChat(news, 3),
        source: "news"
      };
    } catch (err) {
      console.error("News fetch error:", err);
      const lang = detectLanguage(query);
      return {
        content: getNewsResponse(lang),
        source: "knowledge"
      };
    }
  }
  
  const calcResult = await handleCalculation(query);
  if (calcResult.handled && calcResult.reply) {
    await saveToLearnedKnowledge(personaId, query, calcResult.reply, "calculator");
    return {
      content: calcResult.reply,
      source: "calculator"
    };
  }
  
  // Skip learned knowledge cache for price-sensitive queries (need real-time data)
  const lowerQuery = query.toLowerCase();
  const isPriceSensitive = lowerQuery.includes("outlook") || 
    lowerQuery.includes("harga") || 
    lowerQuery.includes("support") || 
    lowerQuery.includes("resistance") ||
    lowerQuery.includes("analisa") ||
    lowerQuery.includes("analisis") ||
    lowerQuery.includes("prediksi") ||
    lowerQuery.includes("forecast");
  
  if (!isPriceSensitive) {
    const learnedMatch = await storage.searchLearnedKnowledge(personaId, query);
    if (learnedMatch) {
      return {
        content: learnedMatch.answer,
        source: "learned",
        cached: true
      };
    }
  }
  
  const coreKnowledge = await loadCoreKnowledge();
  const knowledgeMatch = await searchKnowledgeBase(query, coreKnowledge);
  
  // Fetch live prices for real-time context
  const livePrices = await fetchLivePricesCached();
  const livePriceContext = buildLivePriceContext(livePrices);
  
  // Fetch news + calendar for market-related queries to make responses contextual
  let marketContext = "";
  const needsMarketContext = isPriceSensitive || 
    lowerQuery.includes("emas") || 
    lowerQuery.includes("gold") ||
    lowerQuery.includes("market") ||
    lowerQuery.includes("pasar") ||
    lowerQuery.includes("minggu ini") ||
    lowerQuery.includes("hari ini") ||
    lowerQuery.includes("silver") ||
    lowerQuery.includes("oil") ||
    lowerQuery.includes("minyak");
  
  if (needsMarketContext) {
    try {
      const [newsItems, calendarEvents] = await Promise.all([
        fetchNews(),
        fetchCalendarForContext()
      ]);
      marketContext = buildMarketContext(newsItems, calendarEvents);
    } catch (e) {
      console.error("Failed to fetch market context:", e);
    }
  }
  
  const systemPrompt = buildSystemPrompt(coreKnowledge, knowledgeMatch || undefined, livePriceContext, marketContext);
  
  const ollamaResult = await callOllamaWithTimeout(messages, systemPrompt);
  
  if (ollamaResult.success && ollamaResult.content && !isGibberishResponse(ollamaResult.content)) {
    let content = ollamaResult.content;
    const hasFollowUp = content.includes("Mau lanjut eksplor") || 
                        content.includes("Mau eksplor") ||
                        content.includes("Want to explore") ||
                        content.includes("Ketik angkanya");
    if (!hasFollowUp) {
      content += generateFollowUpQuestions(query, content);
    }
    await saveToLearnedKnowledge(personaId, query, content, "ollama");
    return {
      content: content,
      source: "ollama"
    };
  }
  
  if (ollamaResult.success && ollamaResult.content) {
    console.log("Ollama response detected as gibberish, falling back to OpenAI");
  }
  
  let openaiResponse = await callOpenAI(messages, systemPrompt);
  
  // Add follow-up questions if not present
  const hasFollowUp = openaiResponse.includes("Mau lanjut eksplor") || 
                      openaiResponse.includes("Mau eksplor") ||
                      openaiResponse.includes("Want to explore") ||
                      openaiResponse.includes("Ketik angkanya");
  if (!hasFollowUp) {
    openaiResponse += generateFollowUpQuestions(query, openaiResponse);
  }
  
  await saveToLearnedKnowledge(personaId, query, openaiResponse, "openai");
  
  return {
    content: openaiResponse,
    source: "openai"
  };
}
