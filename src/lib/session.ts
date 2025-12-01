// src/lib/session.ts
export const getOrCreateSessionId = () => {
  if (typeof window === "undefined") return null;

  const key = "nmai_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID(); // atau bikin sendiri
    localStorage.setItem(key, id);
  }
  return id;
};
