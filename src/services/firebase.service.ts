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
import { getFirestore, doc, setDoc, getDoc, deleteDoc, Firestore, Timestamp, enableIndexedDbPersistence, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, FirebaseStorage } from 'firebase/storage';
import { Ledger } from './app.component';

// Interface for Firestore data structure
interface FirestoreLedger {
  name: string;
  createdAt: Timestamp; // Firestore uses Timestamp
  entries: any[]; // Entries are stored as plain objects
}

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
      storageBucket: "triptraccker-tt.firebasestorage.app",
      messagingSenderId: "422434809058",
      appId: "1:422434809058:web:f556f885baa785567d2abb"
    };

    this.firebaseApp = initializeApp(firebaseConfig);
    this.auth = getAuth(this.firebaseApp);
    this.firestore = getFirestore(this.firebaseApp);
    this.storage = getStorage(this.firebaseApp);

    enableIndexedDbPersistence(this.firestore)
      .then(() => this.isReady.set(true))
      .catch((err) => {
        console.warn('Firestore persistence failed:', err.code);
        this.isReady.set(true); // Still ready even if persistence fails
      });
    
    onAuthStateChanged(this.auth, async (user) => {
      if (user && !user.emailVerified) {
          await signOut(this.auth);
          this.currentUser.set(null);
          this.userProfile.set(null);
      } else {
          this.currentUser.set(user);
          if (user) {
            // Check for and create user profile if it doesn't exist
            await this.checkAndCreateUserProfile(user);
            // Fetch the profile
            const profile = await this.getUserProfile(user.uid);
            this.userProfile.set(profile);
          } else {
            this.userProfile.set(null);
          }
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
    // Create the user profile doc in firestore
    await this.checkAndCreateUserProfile(userCredential.user, name);
    await sendEmailVerification(userCredential.user);
    await signOut(this.auth);
  }

  logout(): Promise<void> {
    return signOut(this.auth);
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  // --- User Profile Methods ---
  async checkAndCreateUserProfile(user: User, name?: string): Promise<void> {
    await this.isReady(); // Wait for firestore to be ready
    const userRef = doc(this.firestore, 'users', user.uid);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      const newUserProfile: UserProfile = {
        uid: user.uid,
        email: user.email!,
        name: name || user.displayName || 'New User',
      };
      if (user.photoURL) {
        newUserProfile.photoURL = user.photoURL;
      }
      await setDoc(userRef, newUserProfile);
    }
  }

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    await this.isReady();
    const userRef = doc(this.firestore, 'users', userId);
    const docSnap = await getDoc(userRef);
    return docSnap.exists() ? (docSnap.data() as UserProfile) : null;
  }

  private async uploadProfilePhoto(userId: string, file: File): Promise<string> {
    const filePath = `profilePictures/${userId}/${file.name}`;
    const storageRef = ref(this.storage, filePath);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }

  async updateUserAccount(data: { displayName: string; photoFile: File | null }): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('No user logged in');
  
    let photoURL: string | null = this.userProfile()?.photoURL || null;
  
    // If a new photo file is provided, upload it first.
    if (data.photoFile) {
      photoURL = await this.uploadProfilePhoto(user.uid, data.photoFile);
    }
  
    // Prepare the data for local and remote updates.
    const updatedProfileData: UserProfile = {
      ...this.userProfile()!,
      name: data.displayName,
      photoURL: photoURL ?? undefined, // Use undefined if null for cleaner objects
    };
  
    // Create promises for both Auth and Firestore updates.
    const authUpdatePromise = updateProfile(user, {
      displayName: data.displayName,
      photoURL: photoURL,
    });
  
    const firestoreUpdatePromise = updateDoc(doc(this.firestore, 'users', user.uid), {
      name: data.displayName,
      photoURL: photoURL,
    });
  
    // Run both updates in parallel for better performance.
    await Promise.all([authUpdatePromise, firestoreUpdatePromise]);
  
    // Update local state directly to avoid a refetch, making the UI feel faster.
    this.userProfile.set(updatedProfileData);
  }

  async deleteUserAccount(): Promise<void> {
    const user = this.currentUser();
    if (!user) throw new Error('No user logged in to delete.');

    // 1. Delete profile picture from Storage
    const profile = this.userProfile();
    if (profile?.photoURL) {
      try {
        const photoRef = ref(this.storage, profile.photoURL);
        await deleteObject(photoRef);
      } catch (error: any) {
        // It's okay if the file doesn't exist, we can ignore that error.
        if (error.code !== 'storage/object-not-found') {
          console.error("Could not delete profile photo:", error);
        }
      }
    }
    // 2. Delete user's ledgers document
    const userLedgerRef = doc(this.firestore, 'userLedgers', user.uid);
    await deleteDoc(userLedgerRef);
    
    // 3. Delete user's profile document
    const userProfileRef = doc(this.firestore, 'users', user.uid);
    await deleteDoc(userProfileRef);

    // 4. Delete user from Auth (this will trigger onAuthStateChanged)
    await deleteUser(user);
  }

  // --- Firestore methods for ledgers ---
  async getLedgers(userId: string): Promise<Ledger[]> {
    await this.isReady();
    const userLedgerRef = doc(this.firestore, 'userLedgers', userId);
    const docSnap = await getDoc(userLedgerRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const firestoreLedgers = (data as { ledgers: FirestoreLedger[] }).ledgers;
      return firestoreLedgers.map(ledger => ({
        ...ledger,
        createdAt: ledger.createdAt.toDate(),
      }));
    } else {
      return [];
    }
  }

  async saveLedgers(userId: string, ledgers: Ledger[]): Promise<void> {
    await this.isReady();
    const userLedgerRef = doc(this.firestore, 'userLedgers', userId);
    const ledgersToSave = ledgers.map(ledger => ({
      ...ledger,
      createdAt: Timestamp.fromDate(ledger.createdAt),
    }));
    await setDoc(userLedgerRef, { ledgers: ledgersToSave });
  }
}