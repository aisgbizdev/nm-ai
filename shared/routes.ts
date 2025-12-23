import { z } from 'zod';
import { insertChatSessionSchema, insertMessageSchema, chatSessions, messages } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  sessions: {
    list: {
      method: 'GET' as const,
      path: '/api/sessions',
      responses: {
        200: z.array(z.custom<typeof chatSessions.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/sessions',
      input: insertChatSessionSchema,
      responses: {
        201: z.custom<typeof chatSessions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/sessions/:id',
      responses: {
        200: z.custom<typeof chatSessions.$inferSelect & { messages: typeof messages.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/sessions/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  messages: {
    create: {
      method: 'POST' as const,
      path: '/api/sessions/:id/messages',
      input: z.object({
        content: z.string(),
        role: z.enum(["user", "assistant"]),
      }),
      responses: {
        201: z.custom<typeof messages.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  // Endpoint khusus untuk AI streaming response
  chat: {
    stream: {
      method: 'POST' as const,
      path: '/api/chat',
      input: z.object({
        message: z.string(),
        sessionId: z.number(),
        model: z.string().optional(), // gpt-5.1, ollama, etc.
      }),
      // Response is SSE stream, not JSON
      responses: {}, 
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
