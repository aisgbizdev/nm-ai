## Packages
react-markdown | For rendering markdown messages with code syntax highlighting
framer-motion | For smooth animations and transitions (sidebar, messages)
lucide-react | Icon library (already in base stack but good to confirm usage)
clsx | Utility for constructing className strings conditionally
tailwind-merge | Utility for merging Tailwind CSS classes
date-fns | For formatting dates in chat history

## Notes
- Theme: Dark mode focused with Pink/Cyan accents (Gwen Stacy Spider-Verse style)
- Chat Streaming: Uses SSE (Server-Sent Events) from /api/chat
- File Upload: Uses FormData for /api/personas/:id/knowledge
- Fonts: 'Outfit' for headings, 'Inter' for body text
