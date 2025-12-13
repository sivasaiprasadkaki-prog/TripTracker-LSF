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
  getDocs
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

@Injectable({
  providedIn: 'root',
})
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

    enableIndexedDbPersistence(this.firestore)
      .then(() => this.isReady.set(true))
      .catch(() => this.isReady.set(true));

    onAuthStateChanged(this.auth, async (user) => {
      this.currentUser.set(user);
      if (user) {
        if (!user.emailVerified) {
          await signOut(this.auth);
          this.currentUser.set(null);
          this.userProfile.set(null);
        } else {
          await this.checkAndCreateUserProfile(user);
          const profile = await this.getUserProfile(user.uid);
          this.userProfile.set(profile);
        }
      } else {
        this.userProfile.set(null);
      }
    });
  }

  // ---------- AUTH ----------

  async login(email: string, password: string): Promise<any> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password);
    if (!cred.user.emailVerified) {
      await signOut(this.auth);
      throw new Error('Email not verified');
    }
    return cred;
  }

  async register(name: string, email: string, password: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await this.checkAndCreateUserProfile(cred.user, name);
    await sendEmailVerification(cred.user);
    await signOut(this.auth);
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  // ---------- USER PROFILE ----------

  async checkAndCreateUserProfile(user: User, name?: string): Promise<void> {
    const ref = doc(this.firestore, 'users', user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email,
        name: name || user.displayName || 'New User',
        photoURL: user.photoURL || null
      });
    }
  }

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const ref = doc(this.firestore, 'users', uid);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() as UserProfile : null;
  }

  async updateUserAccount(data: { displayName: string; photoFile?: File | null }): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('No user logged in');

    let photoURL = this.userProfile()?.photoURL;

    if (data.photoFile) {
      const filePath = `profile-photos/${user.uid}/${data.photoFile.name}`;
      const storageRef = ref(this.storage, filePath);
      const snapshot = await uploadBytes(storageRef, data.photoFile);
      photoURL = await getDownloadURL(snapshot.ref);
    }

    await updateProfile(user, {
      displayName: data.displayName,
      photoURL: photoURL,
    });

    const userDocRef = doc(this.firestore, 'users', user.uid);
    await updateDoc(userDocRef, {
      name: data.displayName,
      photoURL: photoURL,
    });

    const updatedProfile = await this.getUserProfile(user.uid);
    this.userProfile.set(updatedProfile);
  }

  // ---------- LEDGER METHODS ----------

  async saveLedger(ledgerId: string, ledgerData: any): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('User not logged in');
    const ref = doc(this.firestore, 'users', user.uid, 'ledgers', ledgerId);
    
    // The error "Property array contains an invalid nested entity" often occurs when Firestore's
    // serialization logic encounters a complex object it can't handle, like a JavaScript Date object,
    // even if it's not directly inside an array. By converting the entire ledger data object to a
    // JSON string and back, we ensure all Date objects are converted to ISO date strings, which are
    // safely serializable by Firestore. This process effectively "cleans" the object of any
    // non-primitive types that Firestore might reject.
    const serializableLedgerData = JSON.parse(JSON.stringify(ledgerData));
    
    await setDoc(ref, serializableLedgerData, { merge: true });
  }

  async getLedgers(): Promise<any[]> {
    const user = this.currentUser();
    if (!user) return [];
    const colRef = collection(this.firestore, 'users', user.uid, 'ledgers');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async deleteLedger(ledgerId: string): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('User not logged in');
    const ref = doc(this.firestore, 'users', user.uid, 'ledgers', ledgerId);
    await deleteDoc(ref);
  }

  // ---------- DELETE ACCOUNT ----------

  async deleteUserAccount(): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('No user logged in');

    // You might want to delete subcollections (like ledgers) here first
    // For now, we'll just delete the user doc and the user auth record.
    await deleteDoc(doc(this.firestore, 'users', user.uid));
    await deleteUser(user);
  }
}
