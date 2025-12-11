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
  updateProfile
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, Firestore, Timestamp, enableIndexedDbPersistence } from 'firebase/firestore';
import { Ledger } from './app.component';

// Interface for Firestore data structure
interface FirestoreLedger {
  name: string;
  createdAt: Timestamp; // Firestore uses Timestamp
  entries: any[]; // Entries are stored as plain objects
}

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private firebaseApp: FirebaseApp;
  private auth: Auth;
  private firestore: Firestore;
  
  readonly currentUser = signal<User | null>(null);

  constructor() {
    const firebaseConfig = {
      apiKey: "AIzaSyBzZHBwMKT6bqKyPLaRIor8c_brT942DHI",
      authDomain: "triptraccker-tt.firebaseapp.com",
      projectId: "triptraccker-tt",
      storageBucket: "triptraccker-tt.firebasestorage.app",
      messagingSenderId: "422434809058",
      appId: "1:422434809058:web:f556f885baa785567d2abb"
    };

    this.firebaseApp = initializeApp(firebaseConfig);
    this.auth = getAuth(this.firebaseApp);
    this.firestore = getFirestore(this.firebaseApp);

    // Enable offline persistence to improve resilience and offline capability.
    // This can also help mitigate initialization-related timing issues.
    enableIndexedDbPersistence(this.firestore)
      .catch((err) => {
        if (err.code == 'failed-precondition') {
          // This can happen if multiple tabs are open.
          console.warn('Firestore persistence failed: Multiple tabs open.');
        } else if (err.code == 'unimplemented') {
          // The browser is not supported.
          console.warn('Firestore persistence not supported in this browser.');
        }
      });
    
    onAuthStateChanged(this.auth, (user) => {
        if (user && !user.emailVerified) {
            signOut(this.auth);
            this.currentUser.set(null);
        } else {
            this.currentUser.set(user);
        }
    });
  }

  async login(email: string, password: string): Promise<any> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    if (!userCredential.user.emailVerified) {
      await signOut(this.auth);
      const error: any = new Error("Email not verified");
      error.code = 'auth/email-not-verified';
      throw error;
    }
    return userCredential;
  }

  async register(name: string, email: string, password: string): Promise<void> {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });
    await sendEmailVerification(userCredential.user);
    await signOut(this.auth);
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  // Firestore methods for ledgers
  async getLedgers(userId: string): Promise<Ledger[]> {
    const userLedgerRef = doc(this.firestore, 'userLedgers', userId);
    const docSnap = await getDoc(userLedgerRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const firestoreLedgers = data.ledgers as FirestoreLedger[];
      // Convert Firestore Timestamps back to JS Date objects
      return firestoreLedgers.map(ledger => ({
        ...ledger,
        createdAt: ledger.createdAt.toDate(),
      }));
    } else {
      // No ledgers found for this user
      return [];
    }
  }

  async saveLedgers(userId: string, ledgers: Ledger[]): Promise<void> {
    const userLedgerRef = doc(this.firestore, 'userLedgers', userId);
    // Convert JS Date objects to Firestore Timestamps before saving
    const ledgersToSave = ledgers.map(ledger => ({
      ...ledger,
      createdAt: Timestamp.fromDate(ledger.createdAt),
    }));
    await setDoc(userLedgerRef, { ledgers: ledgersToSave });
  }
}