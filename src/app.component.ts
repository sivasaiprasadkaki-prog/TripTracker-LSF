import { Component, ChangeDetectionStrategy, signal, inject, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { FirebaseService } from './services/firebase.service';
import { LedgerDetailsComponent } from './ledger-details.component';

export interface Entry {
  id: string;
  type: 'cash-in' | 'cash-out';
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  details: string;
  category: string;
  mode: string;
  amount: number;
  attachments?: string[]; // Changed from File[] to string[] for base64 URLs
  notes?: string;
}

export interface Ledger {
  name: string;
  createdAt: Date;
  entries: Entry[];
}

type View = 'login' | 'register' | 'verifyEmail' | 'forgotPassword' | 'resetLinkSent';
type Theme = 'light' | 'dark';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, LedgerDetailsComponent],
})
export class AppComponent {
  private fb = inject(FormBuilder);
  firebaseService = inject(FirebaseService);

  view = signal<View>('login');
  errorMessage = signal<string | null>(null);
  isLoading = signal(false);
  emailForMessage = signal<string | null>(null);
  
  selectedLedger = signal<Ledger | null>(null);

  currentUser = computed(() => this.firebaseService.currentUser());
  welcomeMessage = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    return `Welcome, ${user.displayName || user.email}`;
  });
  
  // Home page state
  ledgers = signal<Ledger[]>([]);
  isSearchVisible = signal(false);
  isLedgerModalVisible = signal(false);
  editingLedger = signal<Ledger | null>(null);
  isInitialLoadComplete = signal(false);

  // Computed properties for Ledger Modal
  modalTitle = computed(() => this.editingLedger() ? 'Edit Ledger' : 'Create New Ledger');
  modalSubmitButtonText = computed(() => this.editingLedger() ? 'Update' : 'Create');

  // Theme state
  theme = signal<Theme>('dark');

  constructor() {
    effect(() => {
      if (this.theme() === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });

    // Fetch ledgers on login
    effect(async (onCleanup) => {
        const user = this.currentUser();
        if (user) {
            this.isLoading.set(true);
            this.isInitialLoadComplete.set(false);
            const fetchedLedgers = await this.firebaseService.getLedgers(user.uid);
            this.ledgers.set(fetchedLedgers);
            this.isLoading.set(false);
            this.isInitialLoadComplete.set(true);
        } else {
            this.ledgers.set([]);
            this.isInitialLoadComplete.set(false);
        }
    });

     // Save ledgers on any change
     effect(() => {
        const ledgersToSave = this.ledgers();
        const user = this.currentUser();
        // Only save after the initial fetch is complete to avoid overwriting data
        if (user && this.isInitialLoadComplete()) {
            this.firebaseService.saveLedgers(user.uid, ledgersToSave);
        }
    });
  }

  static passwordsMatch(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const repeatPassword = control.get('repeatPassword')?.value;
    return password === repeatPassword ? null : { passwordsMismatch: true };
  }

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  registerForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    repeatPassword: ['', Validators.required],
  }, { validators: AppComponent.passwordsMatch });

  forgotPasswordForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  createLedgerForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
  });

  private resetFormsAndErrors() {
    this.errorMessage.set(null);
    this.loginForm.reset();
    this.registerForm.reset();
    this.forgotPasswordForm.reset();
  }

  switchToRegister() {
    this.resetFormsAndErrors();
    this.view.set('register');
  }

  switchToLogin() {
    this.resetFormsAndErrors();
    this.view.set('login');
  }

  switchToForgotPassword() {
    this.resetFormsAndErrors();
    const loginEmail = this.loginForm.get('email')?.value;
    if (loginEmail) {
      this.forgotPasswordForm.get('email')?.setValue(loginEmail);
    }
    this.view.set('forgotPassword');
  }

  async onLogin() {
    if (this.loginForm.invalid) {
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.value;
    
    try {
      await this.firebaseService.login(email!, password!);
      this.loginForm.reset();
    } catch (error: any) {
      if (error.code === 'auth/email-not-verified') {
        this.emailForMessage.set(email!);
        this.view.set('verifyEmail');
      } else {
        this.errorMessage.set('Password or Email Incorrect');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRegister() {
    if (this.registerForm.invalid) {
        if (this.registerForm.errors?.['passwordsMismatch']) {
            this.errorMessage.set('Passwords do not match.');
        }
        return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { name, email, password } = this.registerForm.value;
    
    try {
      await this.firebaseService.register(name!, email!, password!);
      this.registerForm.reset();
      this.emailForMessage.set(email!);
      this.view.set('verifyEmail');
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        this.errorMessage.set('User already exists. Sign in?');
      } else {
        this.errorMessage.set('An error occurred during registration.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async onForgotPassword() {
    if (this.forgotPasswordForm.invalid) {
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);
    const email = this.forgotPasswordForm.value.email!;

    try {
      await this.firebaseService.sendPasswordReset(email);
      this.emailForMessage.set(email);
      this.view.set('resetLinkSent');
    } catch (error: any) {
      this.emailForMessage.set(email);
      this.view.set('resetLinkSent');
    } finally {
      this.isLoading.set(false);
    }
  }

  logout() {
    this.firebaseService.logout();
    this.switchToLogin();
    this.ledgers.set([]);
    this.selectedLedger.set(null);
  }

  // Home page methods
  toggleSearch() {
    this.isSearchVisible.update(v => !v);
  }

  openLedgerModal(ledger: Ledger | null = null) {
    if (ledger) {
      this.editingLedger.set(ledger);
      this.createLedgerForm.patchValue({ name: ledger.name });
    } else {
      this.editingLedger.set(null);
      this.createLedgerForm.reset();
    }
    this.isLedgerModalVisible.set(true);
  }

  closeLedgerModal() {
    this.isLedgerModalVisible.set(false);
    this.editingLedger.set(null);
    this.createLedgerForm.reset();
  }

  onSaveLedger() {
    if (this.createLedgerForm.invalid) {
      return;
    }
    const ledgerName = this.createLedgerForm.value.name?.trim();
    if (!ledgerName) return;
  
    const currentLedger = this.editingLedger();
    if (currentLedger) {
      // Update logic
      this.ledgers.update(ledgers => 
        ledgers.map(l => l.createdAt.getTime() === currentLedger.createdAt.getTime() ? { ...l, name: ledgerName } : l)
      );
    } else {
      // Create logic
      const newLedger: Ledger = { name: ledgerName, createdAt: new Date(), entries: [] };
      this.ledgers.update(currentLedgers => [...currentLedgers, newLedger]);
    }
    this.closeLedgerModal();
  }
  
  deleteLedger(ledgerToDelete: Ledger) {
    this.ledgers.update(ledgers => ledgers.filter(l => l.createdAt.getTime() !== ledgerToDelete.createdAt.getTime()));
  }

  selectLedger(ledger: Ledger) {
    this.selectedLedger.set(ledger);
  }
  
  goHome() {
    this.selectedLedger.set(null);
  }

  handleLedgerUpdate(updatedLedger: Ledger) {
    this.ledgers.update(currentLedgers => {
      const index = currentLedgers.findIndex(l => l.createdAt.getTime() === updatedLedger.createdAt.getTime());
      if (index > -1) {
        const newLedgers = [...currentLedgers];
        newLedgers[index] = updatedLedger;
        return newLedgers;
      }
      return currentLedgers;
    });
  }

  toggleTheme() {
    this.theme.update(current => current === 'light' ? 'dark' : 'light');
  }
}