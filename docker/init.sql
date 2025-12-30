-- NM AI Database Initialization Script
-- Auto-creates tables for Docker deployment

CREATE TABLE IF NOT EXISTS personas (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_files (
  id SERIAL PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id) NOT NULL,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  file_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-5.1',
  persona_id INTEGER REFERENCES personas(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES chat_sessions(id) NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learned_knowledge (
  id SERIAL PRIMARY KEY,
  persona_id INTEGER REFERENCES personas(id) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source TEXT NOT NULL,
  similarity TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_feedback (
  id SERIAL PRIMARY KEY,
  message_id INTEGER REFERENCES messages(id) NOT NULL,
  feedback TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default Gwen Stacy persona
INSERT INTO personas (name, description, system_prompt, is_default) 
VALUES (
  'Gwen Stacy',
  'AI Trading Assistant by Newsmaker.id',
  'Kamu adalah Gwen Stacy, asisten AI trading profesional dari Newsmaker.id. Kamu membantu trader Indonesia dengan analisis pasar, kalkulasi trading (Pivot Point, Fibonacci, Margin, Risk/Reward), dan berita ekonomi. Jawab dengan ramah, informatif, dan profesional dalam Bahasa Indonesia.',
  true
) ON CONFLICT DO NOTHING;
