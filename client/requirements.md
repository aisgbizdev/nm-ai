## Packages
framer-motion | Smooth animations for messages and transitions
react-markdown | Rendering Markdown in chat messages
date-fns | Formatting dates for chat history
clsx | Utility for conditional classes (often used with tailwind-merge)
tailwind-merge | Utility for merging tailwind classes

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  sans: ["Inter", "sans-serif"],
  display: ["Plus Jakarta Sans", "sans-serif"],
  mono: ["JetBrains Mono", "monospace"],
}

The backend supports SSE streaming at POST /api/chat.
The frontend needs to handle the stream manually or use a fetch wrapper that supports reading the stream.
