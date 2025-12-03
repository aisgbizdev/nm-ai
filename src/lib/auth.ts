import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { app } from "@/lib/firebase";

const auth = getAuth(app);

export const ensureAnonAuth = () =>
  new Promise<string>((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        unsub();
        resolve(user.uid); // ini yang akan jadi "sessionId" kita
      } else {
        try {
          const cred = await signInAnonymously(auth);
          unsub();
          resolve(cred.user.uid);
        } catch (err) {
          unsub();
          reject(err);
        }
      }
    });
  });
