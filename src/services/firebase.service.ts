import { Injectable, signal } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser
} from 'firebase/auth';

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  Firestore,
  enableIndexedDbPersistence,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  FirebaseStorage
} from 'firebase/storage';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
}

@Injectable({ providedIn: 'root' })
export class FirebaseService {

  private firebaseApp: FirebaseApp;
  private auth: Auth;
  private firestore: Firestore;
  private storage: FirebaseStorage;

  readonly isReady = signal(false);
  readonly currentUser = signal<User | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);

  constructor() {
    const firebaseConfig = {
      apiKey: "AIzaSyBzZHBwMKT6bqKyPLaRIor8c_brT942DHI",
      authDomain: "triptraccker-tt.firebaseapp.com",
      projectId: "triptraccker-tt",
      storageBucket: "triptraccker-tt.appspot.com",
      messagingSenderId: "422434809058",
      appId: "1:422434809058:web:f556f885baa785567d2abb"
    };

    this.firebaseApp = initializeApp(firebaseConfig);
    this.auth = getAuth(this.firebaseApp);
    this.firestore = getFirestore(this.firebaseApp);
    this.storage = getStorage(this.firebaseApp);

    enableIndexedDbPersistence(this.firestore).finally(() => {
      this.isReady.set(true);
    });

    onAuthStateChanged(this.auth, async (user) => {
      this.currentUser.set(user);
      if (!user) {
        this.userProfile.set(null);
        return;
      }

      if (!user.emailVerified) {
        await signOut(this.auth);
        return;
      }

      await this.checkAndCreateUserProfile(user);
      this.userProfile.set(await this.getUserProfile(user.uid));
    });
  }

  /* ---------- AUTH ---------- */

  async login(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    if (!cred.user.emailVerified) {
      await signOut(this.auth);
      throw new Error('Email not verified');
    }
  }

  async register(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await this.checkAndCreateUserProfile(cred.user, name);
    await sendEmailVerification(cred.user);
    await signOut(this.auth);
  }

  logout() {
    return signOut(this.auth);
  }

  sendPasswordReset(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  /* ---------- PROFILE ---------- */

  async checkAndCreateUserProfile(user: User, name?: string) {
    const refDoc = doc(this.firestore, 'users', user.uid);
    const snap = await getDoc(refDoc);

    if (!snap.exists()) {
      await setDoc(refDoc, {
        uid: user.uid,
        email: user.email,
        name: name || user.displayName || 'User',
        photoURL: user.photoURL || null
      });
    }
  }

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    return snap.exists() ? snap.data() as UserProfile : null;
  }

  async updateUserAccount(data: { displayName: string; photoFile?: File | null }) {
    const user = this.currentUser();
    if (!user) throw new Error('No user');

    let photoURL = this.userProfile()?.photoURL;

    if (data.photoFile) {
      const path = `profile/${user.uid}/${Date.now()}_${data.photoFile.name}`;
      const snapshot = await uploadBytes(ref(this.storage, path), data.photoFile);
      photoURL = await getDownloadURL(snapshot.ref);
    }

    await updateProfile(user, { displayName: data.displayName, photoURL });
    await updateDoc(doc(this.firestore, 'users', user.uid), {
      name: data.displayName,
      photoURL
    });

    this.userProfile.set(await this.getUserProfile(user.uid));
  }

  /* ---------- LEDGERS ---------- */

  async saveLedger(ledgerId: string, ledgerData: any) {
    const user = this.currentUser();
    if (!user) throw new Error('No user');

    const refDoc = doc(this.firestore, 'users', user.uid, 'ledgers', ledgerId);

    await setDoc(refDoc, {
      name: ledgerData.name,
      createdAt: ledgerData.createdAt ?? serverTimestamp()
    }, { merge: true });
  }

  async getLedgers() {
    const user = this.currentUser();
    if (!user) return [];

    const snap = await getDocs(collection(this.firestore, 'users', user.uid, 'ledgers'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async deleteLedger(ledgerId: string) {
    const user = this.currentUser();
    if (!user) return;

    // FIX: Cast entries to a type with an optional attachments property to resolve type errors.
    const entries = (await this.getEntries(ledgerId)) as { id: string; attachments?: string[] }[];
    for (const e of entries) {
      if (e.attachments) {
        for (const url of e.attachments) {
          await this.deleteAttachment(url).catch(() => {});
        }
      }
      await this.deleteEntry(ledgerId, e.id);
    }

    await deleteDoc(doc(this.firestore, 'users', user.uid, 'ledgers', ledgerId));
  }

  /* ---------- ENTRIES ---------- */

  async getEntries(ledgerId: string) {
    const user = this.currentUser();
    if (!user) return [];

    const entriesCollection = collection(this.firestore, 'users', user.uid, 'ledgers', ledgerId, 'entries');

    const snap = await getDocs(entriesCollection);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async saveEntry(ledgerId: string, entryId: string, data: any) {
    const user = this.currentUser();
    if (!user) throw new Error('No user');

    await setDoc(
      doc(this.firestore, 'users', user.uid, 'ledgers', ledgerId, 'entries', entryId),
      data,
      { merge: true }
    );
  }

  async deleteEntry(ledgerId: string, entryId: string) {
    const user = this.currentUser();
    if (!user) return;

    await deleteDoc(
      doc(this.firestore, 'users', user.uid, 'ledgers', ledgerId, 'entries', entryId)
    );
  }

  /* ---------- ATTACHMENTS ---------- */

  async uploadAttachment(ledgerId: string, entryId: string, file: File): Promise<string> {
    const user = this.currentUser();
    if (!user) throw new Error('No user');

    const path = `attachments/${user.uid}/${ledgerId}/${entryId}/${Date.now()}_${file.name}`;
    const snapshot = await uploadBytes(ref(this.storage, path), file);
    return getDownloadURL(snapshot.ref);
  }

  async deleteAttachment(downloadUrl: string) {
    try {
      const storageRef = ref(this.storage, downloadUrl);
      await deleteObject(storageRef);
    } catch {
      // ignore missing file
    }
  }

  /* ---------- DELETE ACCOUNT ---------- */

  async deleteUserAccount() {
    const user = this.currentUser();
    if (!user) return;

    const ledgers = await this.getLedgers();
    for (const l of ledgers) {
      await this.deleteLedger(l.id);
    }

    await deleteDoc(doc(this.firestore, 'users', user.uid));
    await deleteUser(user);
  }
}