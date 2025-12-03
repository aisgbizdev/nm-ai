// src/lib/chatStore.ts
import {
  collection,
  addDoc,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  writeBatch,     // ⬅️ TAMBAH INI
  doc,            // ⬅️ TAMBAH INI (kalau mau sekalian hapus dokumen sessions/{sessionId})
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ChatMessage {
  id?: string;
  sessionId: string;
  role: "user" | "ai";
  text: string;
  createdAt?: any;
}

// Simpan 1 message
export async function saveMessage(msg: ChatMessage) {
  const messagesCol = collection(db, "sessions", msg.sessionId, "messages");
  await addDoc(messagesCol, {
    sessionId: msg.sessionId, // opsional, cuma biar keliatan di Console
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
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ChatMessage, "id">),
  }));
}

// 🔥 NEW: Hapus semua pesan di 1 session
export async function clearSessionMessages(sessionId: string): Promise<void> {
  const messagesCol = collection(db, "sessions", sessionId, "messages");
  const snapshot = await getDocs(messagesCol);

  if (snapshot.empty) {
    return; // ga ada apa-apa, langsung selesai
  }

  const batch = writeBatch(db);

  snapshot.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  await batch.commit();

  // (Opsional) kalau mau sekalian hapus dokumen "sessions/{sessionId}"
  // Note: kalau elu tidak pernah bikin dokumen sessions/{sessionId} sendiri, ini bisa di-skip
  /*
  const sessionDocRef = doc(db, "sessions", sessionId);
  await deleteDoc(sessionDocRef);
  */
}
