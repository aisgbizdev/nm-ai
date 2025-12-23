# NM Ai - Financial Trading Education Chatbot

## Overview

NM Ai is an AI-powered chatbot specializing in Indonesian futures trading education. Built for Newsmaker.id, it provides market insights, trading rules education, risk simulation, and user protection guidance. The system features a persona-based chat interface with streaming responses, supporting both OpenAI and Ollama models.

The application serves as an educational tool for understanding:
- Futures trading (forex, commodities, indices)
- Bappebti regulations and SPA (Sistem Perdagangan Alternatif) trading rules
- Risk management and margin calculations
- Legal awareness for avoiding investment fraud

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, bundled via Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: shadcn/ui component library with Radix primitives
- **Styling**: Tailwind CSS with custom dark theme (deep navy/indigo color scheme)
- **Animations**: Framer Motion for smooth transitions
- **Markdown Rendering**: react-markdown with remark-gfm for chat message formatting

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful endpoints with Zod schema validation
- **Streaming**: Server-Sent Events (SSE) for real-time chat response streaming
- **File Uploads**: Multer for handling knowledge base file uploads
- **Build System**: esbuild for production server bundling, Vite for client

### AI Integration
- **Primary Model**: OpenAI GPT (configurable via environment variables)
- **Fallback Model**: Ollama for local inference (DeepSeek-R1)
- **Knowledge Base**: Markdown files in `/knowledge/core/` directory loaded as system context
- **Calculator Engine**: Custom handlers for pivot points, Fibonacci levels, margin calculations, and economic calendar queries

### Database Design
- **ORM**: Drizzle ORM with PostgreSQL
- **Schema Location**: `shared/schema.ts`
- **Tables**:
  - `personas`: AI personality configurations with system prompts
  - `knowledge_files`: Uploaded knowledge base documents per persona
  - `learned_knowledge`: Auto-generated knowledge from AI responses
  - `chat_sessions`: Conversation containers with model selection
  - `messages`: Individual chat messages with role and metadata

### Key Design Patterns
- **Shared Types**: `shared/` directory contains schema and route definitions used by both client and server
- **Path Aliases**: `@/` maps to client source, `@shared/` maps to shared directory
- **API Contract**: Routes defined in `shared/routes.ts` with Zod schemas for type-safe API calls
- **Persona System**: Configurable AI personalities with custom system prompts and knowledge bases

## External Dependencies

### AI Services
- **OpenAI API**: Primary LLM provider (API key via `AI_INTEGRATIONS_OPENAI_API_KEY`)
- **Ollama**: Optional local LLM server (configurable base URL via `OLLAMA_BASE_URL`)

### Database
- **PostgreSQL**: Primary data store (connection via `DATABASE_URL` environment variable)
- **Drizzle Kit**: Database migrations stored in `/migrations` directory

### External APIs
- **Quotes API**: Real-time market quotes (`QUOTES_API_URL` environment variable)
- **Calendar API**: Economic calendar data (`CALENDAR_API_URL` environment variable)

### Development Tools
- **Replit Integrations**: Vite plugins for dev banner, cartographer, and runtime error overlay
- **TypeScript**: Strict mode enabled with bundler module resolution

### Key npm Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM and schema validation
- `@tanstack/react-query`: Async state management
- `framer-motion`: Animation library
- `react-markdown` / `remark-gfm`: Markdown rendering
- `date-fns`: Date formatting utilities
- `multer`: File upload handling