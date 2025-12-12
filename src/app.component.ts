import { Component, ChangeDetectionStrategy, signal, inject, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { FirebaseService, UserProfile } from './services/firebase.service';
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
type ProfileModalView = 'view' | 'edit' | 'deleteConfirm';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, LedgerDetailsComponent],
})
export class AppComponent implements OnInit {
  private fb = inject(FormBuilder);
  firebaseService = inject(FirebaseService);

  view = signal<View>('login');
  errorMessage = signal<string | null>(null);
  isLoading = signal(false);
  emailForMessage = signal<string | null>(null);
  
  selectedLedger = signal<Ledger | null>(null);

  currentUser = computed(() => this.firebaseService.currentUser());
  userProfile = computed(() => this.firebaseService.userProfile());

  welcomeMessage = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    return `Welcome, ${this.userProfile()?.name || user.displayName || user.email}`;
  });
  
  // Home page state
  ledgers = signal<Ledger[]>([]);
  isSearchVisible = signal(false);
  isLedgerModalVisible = signal(false);
  editingLedger = signal<Ledger | null>(null);
  isInitialLoadComplete = signal(false);
  isPreview = signal(false); // Signal to control preview mode

  // Profile Modal state
  isProfileModalVisible = signal(false);
  profileModalView = signal<ProfileModalView>('view');
  profilePhotoPreview = signal<string | null>(null);
  profilePhotoFile = signal<File | null>(null);

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

    // --- FIREBASE EFFECTS (Now conditional) ---
    // Fetch ledgers on login
    effect(async () => {
        if (this.isPreview()) return; // Do not run in preview mode
        const user = this.currentUser();
        const ready = this.firebaseService.isReady(); 
        if (user && ready) {
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
        if (this.isPreview()) return; // Do not run in preview mode
        const ledgersToSave = this.ledgers();
        const user = this.currentUser();
        const ready = this.firebaseService.isReady();
        if (user && this.isInitialLoadComplete() && ready) {
            this.firebaseService.saveLedgers(user.uid, ledgersToSave);
        }
    });
  }

  ngOnInit() {
    // --- PREVIEW SETUP ---
    this.isPreview.set(true); // Activate preview mode to disable Firebase effects
    this.firebaseService.currentUser.set({ uid: 'preview-user' } as any);
    this.firebaseService.userProfile.set({
      uid: 'preview-user',
      name: 'Preview User',
      email: 'preview@test.com',
    });

    const sampleLedger: Ledger = {
      name: 'Trip to the Alps',
      createdAt: new Date(),
      entries: [
        {
          id: '1',
          type: 'cash-out',
          date: '2024-07-28',
          time: '13:30',
          details: 'Mountain Lodge Dinner',
          category: 'Food',
          mode: 'Card',
          amount: 125.50,
          attachments: [
            'https://picsum.photos/seed/receipt1/800/1200',
            'https://picsum.photos/seed/receipt2/800/1200',
            'https://picsum.photos/seed/receipt3/800/1200'
          ],
          notes: 'Receipts for dinner and drinks.'
        },
        {
          id: '2',
          type: 'cash-in',
          date: '2024-07-28',
          time: '10:00',
          details: 'Received travel advance',
          category: 'Advance',
          mode: 'Bank Transfer',
          amount: 500,
        },
        {
          id: '3',
          type: 'cash-out',
          date: '2024-07-29',
          time: '09:15',
          details: 'Ski Pass',
          category: 'Transport',
          mode: 'UPI',
          amount: 80,
           attachments: ['https://picsum.photos/seed/skipass/800/1200']
        }
      ]
    };
    // Set both the main list and the selected ledger for a consistent preview
    this.ledgers.set([sampleLedger]);
    this.selectedLedger.set(sampleLedger);
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

  editProfileForm = this.fb.group({
    name: ['', Validators.required]
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
    if (this.loginForm.invalid) return;
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
    if (this.forgotPasswordForm.invalid) return;
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

  async logout() {
    await this.firebaseService.logout();
    this.switchToLogin();
    this.ledgers.set([]);
    this.selectedLedger.set(null);
  }

  // Home page methods
  toggleSearch() { this.isSearchVisible.update(v => !v); }
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
    if (this.createLedgerForm.invalid) return;
    const ledgerName = this.createLedgerForm.value.name?.trim();
    if (!ledgerName) return;
  
    const currentLedger = this.editingLedger();
    if (currentLedger) {
      this.ledgers.update(ledgers => 
        ledgers.map(l => l.createdAt.getTime() === currentLedger.createdAt.getTime() ? { ...l, name: ledgerName } : l)
      );
    } else {
      const newLedger: Ledger = { name: ledgerName, createdAt: new Date(), entries: [] };
      this.ledgers.update(currentLedgers => [...currentLedgers, newLedger]);
    }
    this.closeLedgerModal();
  }
  deleteLedger(ledgerToDelete: Ledger) {
    this.ledgers.update(ledgers => ledgers.filter(l => l.createdAt.getTime() !== ledgerToDelete.createdAt.getTime()));
  }
  selectLedger(ledger: Ledger) { this.selectedLedger.set(ledger); }
  goHome() { this.selectedLedger.set(null); }
  handleLedgerUpdate(updatedLedger: Ledger) {
    this.ledgers.update(currentLedgers => {
      const index = currentLedgers.findIndex(l => l.createdAt.getTime() === updatedLedger.createdAt.getTime());
      if (index > -1) {
        const newLedgers = [...currentLedgers]; newLedgers[index] = updatedLedger; return newLedgers;
      }
      return currentLedgers;
    });
  }
  toggleTheme() { this.theme.update(current => current === 'light' ? 'dark' : 'light'); }

  // Profile Modal Methods
  openProfileModal() { this.isProfileModalVisible.set(true); }
  closeProfileModal() {
    this.isProfileModalVisible.set(false);
    this.profileModalView.set('view');
    this.profilePhotoFile.set(null);
    this.profilePhotoPreview.set(null);
    this.errorMessage.set(null);
  }
  switchToEditProfile() {
    this.editProfileForm.patchValue({ name: this.userProfile()?.name });
    this.profileModalView.set('edit');
  }
  onProfilePhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.profilePhotoFile.set(file);
      const reader = new FileReader();
      reader.onload = () => {
        this.profilePhotoPreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }
  async onUpdateProfile() {
    if (this.editProfileForm.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const newName = this.editProfileForm.value.name!;
      const newPhoto = this.profilePhotoFile();
      await this.firebaseService.updateUserAccount({
        displayName: newName,
        photoFile: newPhoto,
      });
      this.profileModalView.set('view');
      this.profilePhotoFile.set(null);
      this.profilePhotoPreview.set(null);
    } catch (error) {
      this.errorMessage.set('Failed to update profile. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }
  async onDeleteAccount() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.firebaseService.deleteUserAccount();
      this.closeProfileModal();
      // The onAuthStateChanged handler will clear out local state
    } catch (error) {
      this.errorMessage.set('Failed to delete account. Please re-authenticate and try again.');
      this.isLoading.set(false);
    }
  }
}