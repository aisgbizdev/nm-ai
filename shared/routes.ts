import { z } from 'zod';
import { insertChatSessionSchema, insertMessageSchema, chatSessions, messages, personas, insertPersonaSchema } from './schema';

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
  personas: {
    list: {
      method: 'GET' as const,
      path: '/api/personas',
      responses: {
        200: z.array(z.custom<typeof personas.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/personas',
      input: insertPersonaSchema,
      responses: {
        201: z.custom<typeof personas.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: { // Untuk update instruksi Gwen Stacy
        method: 'PUT' as const,
        path: '/api/personas/:id',
        input: insertPersonaSchema.partial(),
        responses: {
          200: z.custom<typeof personas.$inferSelect>(),
          404: errorSchemas.notFound,
        },
    }
  },
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
        200: z.custom<typeof chatSessions.$inferSelect & { messages: typeof messages.$inferSelect[], persona: typeof personas.$inferSelect | null }>(),
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
  chat: {
    stream: {
      method: 'POST' as const,
      path: '/api/chat',
      input: z.object({
        message: z.string(),
        sessionId: z.number(),
      }),
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
