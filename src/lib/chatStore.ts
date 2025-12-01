// src/lib/chatStore.ts
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";


export interface ChatMessage {
  id?: string;
  sessionId: string;
  role: "user" | "ai";
  text: string;
  createdAt?: any;
}

const chatsCol = collection(db, "chats");

// Simpan 1 message
export async function saveMessage(msg: ChatMessage) {
  const messagesCol = collection(db, "sessions", msg.sessionId, "messages");
  await addDoc(messagesCol, {
    role: msg.role,
    text: msg.text,
    createdAt: serverTimestamp(),
  });
}


// Ambil semua chat by sessionId (order by time ascending)
export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  const messagesCol = collection(db, "sessions", sessionId, "messages");

  const q = query(messagesCol, orderBy("createdAt", "asc"));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ChatMessage, "id">),
  }));
} 
