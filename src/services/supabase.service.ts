import { Injectable, inject, signal, effect } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { Ledger } from '../app.component';

// This lets TypeScript know that the Supabase client will be available on the window object
// after the CDN script has loaded.
declare global {
  interface Window {
    supabase: any;
  }
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  // IMPORTANT: Replace these with your actual Supabase project URL and public anon key.
  private supabaseUrl = 'https://your-project-ref.supabase.co';
  private supabaseKey = 'your-public-anon-key';
  private supabase: any; // Using `any` for the client type from the CDN script

  private firebaseService = inject(FirebaseService);
  
  readonly isReady = signal(false);

  constructor() {
    if (window.supabase) {
        this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        this.isReady.set(true);
        console.log('Supabase client initialized.');
    } else {
        console.error('Supabase client not found. Make sure the script in index.html is loaded.');
    }

    // This effect listens for changes in the Firebase authentication state.
    // When a user logs in, it securely passes their authentication token to Supabase.
    // This allows you to enforce Row Level Security (RLS) policies in Supabase
    // based on the user's ID from Firebase.
    effect(() => {
        const user = this.firebaseService.currentUser();
        // Check if user exists and is a valid Firebase user object with getIdToken method
        if (user && typeof user.getIdToken === 'function') {
            user.getIdToken().then(token => {
                this.supabase.auth.setSession({ access_token: token, refresh_token: '' });
            }).catch(err => console.error("Error getting Firebase token for Supabase", err));
        } else if (!user) { // Only sign out if user is truly null
            this.supabase.auth.signOut();
        }
    });
  }

  /**
   * Fetches the ledgers for a given user from the 'ledgers' table in Supabase.
   * Assumes a table structure: `ledgers (user_id TEXT PRIMARY KEY, ledgers_data JSONB)`
   * and an RLS policy like: `(auth.uid() = user_id)` for select.
   */
  async getLedgers(userId: string): Promise<Ledger[]> {
    if (!this.isReady()) return [];
    
    const { data, error } = await this.supabase
      .from('ledgers')
      .select('ledgers_data')
      .eq('user_id', userId)
      .single();

    // 'PGRST116' means no rows were found, which is a valid case for a new user.
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching ledgers from Supabase:', error);
      return [];
    }

    if (data && data.ledgers_data) {
      // Supabase returns dates as strings in JSONB, so we need to convert them back to Date objects.
      return (data.ledgers_data as any[]).map(ledger => ({
        ...ledger,
        createdAt: new Date(ledger.createdAt),
      }));
    }

    return []; // Return empty array if no data exists
  }

  /**
   * Saves (inserts or updates) the ledgers for a given user in the 'ledgers' table.
   * Uses `upsert` to handle both new and existing user data seamlessly.
   * Assumes an RLS policy like: `(auth.uid() = user_id)` for insert/update.
   */
  async saveLedgers(userId: string, ledgers: Ledger[]): Promise<void> {
     if (!this.isReady()) return;
    
    // The Supabase client automatically serializes Date objects to ISO strings.
    const { error } = await this.supabase
      .from('ledgers')
      .upsert({ user_id: userId, ledgers_data: ledgers });

    if (error) {
      console.error('Error saving ledgers to Supabase:', error);
    }
  }
}
