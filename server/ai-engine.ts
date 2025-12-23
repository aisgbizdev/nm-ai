import OpenAI from "openai";
import { storage } from "./storage";
import * as fs from "fs";
import * as path from "path";
import { handleCalculation } from "./calculators";

const openaiClient = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:1.5b";
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT_MS || "7000");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const KNOWLEDGE_CORE_PATH = path.join(process.cwd(), "knowledge", "core");

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
  const newsKeywords = ['berita', 'news', 'artikel', 'update', 'kabar', 'headline', 'terbaru', 'terakhir', 'breaking'];
  const queryLower = query.toLowerCase();
  return newsKeywords.some(k => queryLower.includes(k)) && 
         (queryLower.includes('newsmaker') || queryLower.includes('nm'));
}

function getNewsResponse(): string {
  return `## Berita Terbaru Newsmaker.id

Untuk mendapatkan berita trading terbaru dari Newsmaker.id, silakan kunjungi langsung:

**Website Resmi:**
🔗 [newsmaker.id](https://newsmaker.id)

**Update Real-time via Sosial Media:**
- 📺 TikTok Live: [@newsmaker23_talk](https://tiktok.com/@newsmaker23_talk) - Morning Call setiap pagi
- 📚 TikTok Edukasi: [@newsmaker23](https://tiktok.com/@newsmaker23) - Konten edukatif harian

**Aplikasi Mobile:**
- **Newsmaker23 App** - Berita & analisa langsung di HP
- **Pro Trader App** - Quotes real-time + signal alerts

Tim editorial Newsmaker.id update berita setiap hari perdagangan dengan analisa yang mendalam dan akurat.

---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*`;
}

export interface AIResponse {
  content: string;
  source: "calculator" | "knowledge" | "learned" | "ollama" | "openai";
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

export function buildSystemPrompt(coreKnowledge: string, contextSnippet?: string): string {
  let prompt = `# IDENTITAS NM Ai (Gwen Stacy)

Kamu adalah NM Ai, asisten editorial & edukatif dari Newsmaker.id.
Tagline: "Cepat. Akurat. Bersahabat."

## GAYA BICARA
- Tenang tapi berwibawa
- Cerdas tapi bersahabat
- Dalam tapi mudah dimengerti
- Reflektif, bukan jualan sinyal
- Selalu mengingatkan bahwa informasi bersifat edukatif, bukan saran investasi

## ATURAN WAJIB
- Jawab dalam Bahasa Indonesia (boleh sisip sedikit istilah teknis Inggris)
- Tidak memberi sinyal beli/jual
- Tidak berspekulasi liar
- Selalu menegaskan informasi = edukatif
- Jika ada pertanyaan yang tidak bisa dijawab dari knowledge base, sampaikan dengan jujur

## REFERENSI KNOWLEDGE BASE (Gunakan untuk menjawab)
${coreKnowledge.substring(0, 15000)}
`;

  if (contextSnippet) {
    prompt += `\n\n## KONTEKS SPESIFIK UNTUK PERTANYAAN INI\n${contextSnippet}`;
  }

  prompt += `\n\n## SIGNATURE
Akhiri jawaban dengan:
---
*NM Ai - Newsmaker.id*
*Informasi bersifat edukatif, bukan saran investasi.*
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

export async function* streamQuery(
  query: string,
  messages: { role: string; content: string }[],
  personaId: number
): AsyncGenerator<{ content?: string; source?: string; done?: boolean }, void, unknown> {
  
  if (isNewsRequest(query)) {
    const newsResponse = getNewsResponse();
    yield { content: newsResponse, source: "knowledge", done: true };
    return;
  }
  
  const calcResult = await handleCalculation(query);
  if (calcResult.handled && calcResult.reply) {
    await saveToLearnedKnowledge(personaId, query, calcResult.reply, "calculator");
    yield { content: calcResult.reply, source: "calculator", done: true };
    return;
  }
  
  const learnedMatch = await storage.searchLearnedKnowledge(personaId, query);
  if (learnedMatch) {
    yield { content: learnedMatch.answer, source: "learned", done: true };
    return;
  }
  
  const coreKnowledge = await loadCoreKnowledge();
  const knowledgeMatch = await searchKnowledgeBase(query, coreKnowledge);
  
  const systemPrompt = buildSystemPrompt(coreKnowledge, knowledgeMatch || undefined);
  
  let fullResponse = "";
  let source: "ollama" | "openai" = "openai";
  
  const ollamaResult = await callOllamaWithTimeout(messages, systemPrompt);
  
  if (ollamaResult.success && ollamaResult.content && !isGibberishResponse(ollamaResult.content)) {
    source = "ollama";
    fullResponse = ollamaResult.content;
    yield { content: ollamaResult.content, source: "ollama" };
  } else {
    if (ollamaResult.success && ollamaResult.content) {
      console.log("Ollama response detected as gibberish, falling back to OpenAI");
    }
    for await (const chunk of streamOpenAI(messages, systemPrompt)) {
      fullResponse += chunk;
      yield { content: chunk, source: "openai" };
    }
    source = "openai";
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
    return {
      content: getNewsResponse(),
      source: "knowledge"
    };
  }
  
  const calcResult = await handleCalculation(query);
  if (calcResult.handled && calcResult.reply) {
    await saveToLearnedKnowledge(personaId, query, calcResult.reply, "calculator");
    return {
      content: calcResult.reply,
      source: "calculator"
    };
  }
  
  const learnedMatch = await storage.searchLearnedKnowledge(personaId, query);
  if (learnedMatch) {
    return {
      content: learnedMatch.answer,
      source: "learned",
      cached: true
    };
  }
  
  const coreKnowledge = await loadCoreKnowledge();
  const knowledgeMatch = await searchKnowledgeBase(query, coreKnowledge);
  const systemPrompt = buildSystemPrompt(coreKnowledge, knowledgeMatch || undefined);
  
  const ollamaResult = await callOllamaWithTimeout(messages, systemPrompt);
  
  if (ollamaResult.success && ollamaResult.content && !isGibberishResponse(ollamaResult.content)) {
    await saveToLearnedKnowledge(personaId, query, ollamaResult.content, "ollama");
    return {
      content: ollamaResult.content,
      source: "ollama"
    };
  }
  
  if (ollamaResult.success && ollamaResult.content) {
    console.log("Ollama response detected as gibberish, falling back to OpenAI");
  }
  
  const openaiResponse = await callOpenAI(messages, systemPrompt);
  await saveToLearnedKnowledge(personaId, query, openaiResponse, "openai");
  
  return {
    content: openaiResponse,
    source: "openai"
  };
}
