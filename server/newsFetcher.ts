interface NewsItem {
  id: string;
  title: string;
  excerpt?: string;
  content?: string;
  url?: string;
  category?: string;
  publishedAt?: string;
  source?: string;
  imageUrl?: string;
}

interface NewsCache {
  data: NewsItem[];
  timestamp: number;
}

const NEWS_API_URL = "https://endpoapi-production-3202.up.railway.app/api/news-id";
const CACHE_TTL_MS = 5 * 60 * 1000;

let newsCache: NewsCache | null = null;

export async function fetchNews(forceRefresh = false): Promise<NewsItem[]> {
  if (!forceRefresh && newsCache && Date.now() - newsCache.timestamp < CACHE_TTL_MS) {
    return newsCache.data;
  }

  try {
    const response = await fetch(NEWS_API_URL, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error("News API error:", response.status);
      return newsCache?.data || [];
    }

    const rawData = await response.json();
    
    let newsItems: NewsItem[] = [];
    
    if (Array.isArray(rawData)) {
      newsItems = rawData.slice(0, 10).map((item: any, index: number) => ({
        id: item.id?.toString() || `news-${index}`,
        title: item.title || item.headline || "Berita Terbaru",
        excerpt: item.excerpt || item.summary || item.description || "",
        content: item.content || item.body || "",
        url: item.url || item.link || `https://newsmaker.id`,
        category: item.category || item.tag || "Market",
        publishedAt: item.publishedAt || item.date || item.created_at || new Date().toISOString(),
        source: item.source || "Newsmaker.id",
        imageUrl: item.imageUrl || item.image || item.thumbnail || "",
      }));
    } else if (rawData.data && Array.isArray(rawData.data)) {
      newsItems = rawData.data.slice(0, 10).map((item: any, index: number) => ({
        id: item.id?.toString() || `news-${index}`,
        title: item.title || item.headline || "Berita Terbaru",
        excerpt: item.excerpt || item.summary || item.description || "",
        content: item.content || item.body || "",
        url: item.url || item.link || `https://newsmaker.id`,
        category: item.category || item.tag || "Market",
        publishedAt: item.publishedAt || item.date || item.created_at || new Date().toISOString(),
        source: item.source || "Newsmaker.id",
        imageUrl: item.imageUrl || item.image || item.thumbnail || "",
      }));
    } else if (rawData.articles && Array.isArray(rawData.articles)) {
      newsItems = rawData.articles.slice(0, 10).map((item: any, index: number) => ({
        id: item.id?.toString() || `news-${index}`,
        title: item.title || item.headline || "Berita Terbaru",
        excerpt: item.excerpt || item.summary || item.description || "",
        content: item.content || item.body || "",
        url: item.url || item.link || `https://newsmaker.id`,
        category: item.category || item.tag || "Market",
        publishedAt: item.publishedAt || item.date || item.created_at || new Date().toISOString(),
        source: item.source || "Newsmaker.id",
        imageUrl: item.imageUrl || item.image || item.thumbnail || "",
      }));
    }

    newsCache = {
      data: newsItems,
      timestamp: Date.now(),
    };

    return newsItems;
  } catch (error) {
    console.error("Failed to fetch news:", error);
    return newsCache?.data || [];
  }
}

export function formatNewsForChat(news: NewsItem[], limit = 3): string {
  if (!news.length) {
    return `Maaf, saya tidak bisa mengambil berita terbaru saat ini. Silakan cek langsung di [Newsmaker.id](https://newsmaker.id) untuk update terkini.`;
  }

  const limitedNews = news.slice(0, limit);
  
  let response = `**Berita Terkini dari Newsmaker.id**\n\n`;
  
  limitedNews.forEach((item, index) => {
    const date = new Date(item.publishedAt || new Date());
    const formattedDate = date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
    
    response += `**${index + 1}. ${item.title}**\n`;
    if (item.excerpt) {
      response += `${item.excerpt.slice(0, 150)}${item.excerpt.length > 150 ? "..." : ""}\n`;
    }
    response += `*${formattedDate} WIB* | ${item.category || "Market"}\n`;
    if (item.url) {
      response += `[Baca selengkapnya](${item.url})\n`;
    }
    response += `\n`;
  });
  
  response += `---\n`;
  response += `*Sumber: Newsmaker.id - Berita trading & investasi terpercaya*\n\n`;
  response += `Untuk berita lengkap dan update real-time, kunjungi:\n`;
  response += `- Website: [Newsmaker.id](https://newsmaker.id)\n`;
  response += `- TikTok: [@newsmaker23_talk](https://tiktok.com/@newsmaker23_talk)\n\n`;
  response += `*Disclaimer: Berita bersifat informatif, bukan rekomendasi investasi.*`;
  
  return response;
}

export function isNewsRequest(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  
  // Exclude calendar requests from being detected as news
  const calendarKeywords = ["kalender", "calendar", "jadwal berita"];
  if (calendarKeywords.some(k => lowerMsg.includes(k))) {
    return false;
  }
  
  const newsKeywords = [
    "berita", "news", "kabar", "update", "terbaru",
    "breaking", "headline", "informasi pasar", "market news",
    "apa yang terjadi", "what's happening", "latest",
    "perkembangan", "situasi pasar", "kondisi pasar"
  ];
  
  return newsKeywords.some(keyword => lowerMsg.includes(keyword));
}
