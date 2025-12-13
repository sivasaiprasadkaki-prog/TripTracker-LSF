import { Component, ChangeDetectionStrategy, signal, inject, computed, effect, OnInit, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { FirebaseService } from './services/firebase.service';
import { LedgerDetailsComponent } from './ledger-details.component';

/* ---------- MODELS ---------- */

export interface Entry {
  id: string;
  type: 'cash-in' | 'cash-out';
  date: string;
  time: string;
  details: string;
  category: string;
  mode: string;
  amount: number;
  attachments?: string[];
  notes?: string;
}

export interface Ledger {
  id: string;
  name: string;
  createdAt: Date;
  entries: Entry[];
}

type View = 'login' | 'register' | 'verifyEmail' | 'forgotPassword' | 'resetLinkSent';
type Theme = 'light' | 'dark';
type ProfileModalView = 'view' | 'edit' | 'deleteConfirm';

/* ---------- COMPONENT ---------- */

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, LedgerDetailsComponent],
})
export class AppComponent implements OnInit {

  private fb = inject(FormBuilder);
  private elementRef = inject(ElementRef);
  firebaseService = inject(FirebaseService);

  /* ---------- AUTH ---------- */

  view = signal<View>('login');
  errorMessage = signal<string | null>(null);
  isLoading = signal(false);

  currentUser = computed(() => this.firebaseService.currentUser());
  userProfile = computed(() => this.firebaseService.userProfile());

  welcomeMessage = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    return `Welcome, ${this.userProfile()?.name || user.email}`;
  });

  emailForMessage = computed(() => {
    if (this.view() === 'verifyEmail') {
      return this.registerForm.get('email')?.value || '';
    }
    if (this.view() === 'resetLinkSent') {
      return this.forgotPasswordForm.get('email')?.value || '';
    }
    return '';
  });

  /* ---------- LEDGERS ---------- */

  ledgers = signal<Ledger[]>([]);
  selectedLedger = signal<Ledger | null>(null);
  isLedgerModalVisible = signal(false);
  editingLedger = signal<Ledger | null>(null);
  isSearchVisible = signal(false);

  modalTitle = computed(() => this.editingLedger() ? 'Edit Ledger' : 'Create New Ledger');
  modalSubmitButtonText = computed(() => this.editingLedger() ? 'Update' : 'Create');

  /* ---------- PROFILE ---------- */

  isProfileModalVisible = signal(false);
  isProfileDropdownVisible = signal(false);
  profileModalView = signal<ProfileModalView>('view');
  profilePhotoFile = signal<File | null>(null);
  profilePhotoPreview = signal<string | null>(null);

  /* ---------- THEME ---------- */

  theme = signal<Theme>('dark');

  constructor() {
    effect(() => {
      document.documentElement.classList.toggle('dark', this.theme() === 'dark');
    });

    /* 🔥 LOAD LEDGERS AFTER LOGIN */
    effect(async () => {
      const user = this.currentUser();
      if (!user) {
        this.ledgers.set([]);
        return;
      }

      const data = await this.firebaseService.getLedgers();

      this.ledgers.set(
        data.map((l: any) => {
          // Firebase returns Timestamps which need to be converted to JS Date objects.
          // This handles both Timestamp objects and date strings/numbers gracefully.
          const createdAtDate = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt);
          return {
            ...l,
            createdAt: createdAtDate,
          };
        })
      );
    });
  }

  ngOnInit() {}
  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Close dropdown if click is outside of the profile button/menu area
    if (this.isProfileDropdownVisible() && !this.elementRef.nativeElement.querySelector('.profile-menu-container')?.contains(event.target)) {
      this.isProfileDropdownVisible.set(false);
    }
  }

  /* ---------- FORMS ---------- */

  static passwordsMatch(control: AbstractControl): ValidationErrors | null {
    return control.get('password')?.value === control.get('repeatPassword')?.value
      ? null
      : { mismatch: true };
  }

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
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
    name: ['', Validators.required],
  });

  editProfileForm = this.fb.group({
    name: ['', Validators.required],
  });

  /* ---------- AUTH METHODS ---------- */

  switchToRegister() {
    this.view.set('register');
    this.errorMessage.set(null);
    this.registerForm.reset();
  }

  switchToLogin() {
    this.view.set('login');
    this.errorMessage.set(null);
    this.loginForm.reset();
  }
  
  switchToForgotPassword() {
    this.view.set('forgotPassword');
    this.errorMessage.set(null);
    this.forgotPasswordForm.reset();
  }

  async onLogin() {
    if (this.loginForm.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.firebaseService.login(
        this.loginForm.value.email!,
        this.loginForm.value.password!
      );
      this.loginForm.reset();
    } catch (e: any) {
      this.errorMessage.set(e.message === 'Email not verified' ? e.message : 'Invalid email or password');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRegister() {
    if (this.registerForm.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.firebaseService.register(
        this.registerForm.value.name!,
        this.registerForm.value.email!,
        this.registerForm.value.password!
      );
      this.view.set('verifyEmail');
    } catch {
      this.errorMessage.set('Registration failed. This email may already be in use.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onForgotPassword() {
    if (this.forgotPasswordForm.invalid) return;
    this.isLoading.set(true);
    await this.firebaseService.sendPasswordReset(this.forgotPasswordForm.value.email!);
    this.isLoading.set(false);
    this.view.set('resetLinkSent');
  }

  async logout() {
    this.isProfileDropdownVisible.set(false);
    await this.firebaseService.logout();
    this.view.set('login');
    this.ledgers.set([]);
    this.selectedLedger.set(null);
  }

  /* ---------- LEDGER METHODS ---------- */

  toggleSearch() {
    this.isSearchVisible.update(v => !v);
  }

  openLedgerModal(ledger: Ledger | null = null) {
    this.editingLedger.set(ledger);
    this.createLedgerForm.setValue({ name: ledger?.name || '' });
    this.isLedgerModalVisible.set(true);
  }

  closeLedgerModal() {
    this.isLedgerModalVisible.set(false);
    this.editingLedger.set(null);
    this.createLedgerForm.reset();
  }

  async onSaveLedger() {
    if (this.createLedgerForm.invalid) return;

    const editing = this.editingLedger();
    const ledgerData = {
      name: this.createLedgerForm.value.name!,
    };

    try {
      if (editing) {
        const updatedLedger = { ...editing, ...ledgerData };
        await this.firebaseService.saveLedger(editing.id, updatedLedger);
        this.ledgers.update(list => list.map(l => l.id === editing.id ? updatedLedger : l));
      } else {
        const ledgerId = Date.now().toString();
        const newLedger: Ledger = {
          id: ledgerId,
          name: ledgerData.name,
          createdAt: new Date(),
          entries: [],
        };
        await this.firebaseService.saveLedger(ledgerId, newLedger);
        this.ledgers.update(list => [...list, newLedger]);
      }
      this.closeLedgerModal();
    } catch (e) {
      console.error(e);
      this.errorMessage.set('Failed to save ledger');
    }
  }

  async deleteLedger(ledger: Ledger) {
    try {
      await this.firebaseService.deleteLedger(ledger.id);
      this.ledgers.update(list => list.filter(l => l.id !== ledger.id));
    } catch (e) {
      console.error(e);
      this.errorMessage.set('Failed to delete ledger');
    }
  }

  selectLedger(ledger: Ledger) {
    this.selectedLedger.set(ledger);
  }

  goHome() {
    this.selectedLedger.set(null);
  }

  async handleLedgerUpdate(updatedLedger: Ledger) {
    await this.firebaseService.saveLedger(updatedLedger.id, updatedLedger);
    this.ledgers.update(list => list.map(l => l.id === updatedLedger.id ? updatedLedger : l));
    this.selectedLedger.set(updatedLedger);
  }

  /* ---------- PROFILE ---------- */
  
  toggleProfileDropdown() {
    this.isProfileDropdownVisible.update(v => !v);
  }

  openProfileModal() {
    this.isProfileDropdownVisible.set(false);
    this.isProfileModalVisible.set(true);
  }

  closeProfileModal() {
    this.isProfileModalVisible.set(false);
    this.profileModalView.set('view');
    this.profilePhotoFile.set(null);
    this.profilePhotoPreview.set(null);
    this.errorMessage.set(null);
  }
  
  switchToEditProfile() {
    this.editProfileForm.patchValue({ name: this.userProfile()?.name || '' });
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
      await this.firebaseService.updateUserAccount({
        displayName: this.editProfileForm.value.name!,
        photoFile: this.profilePhotoFile(),
      });
      this.closeProfileModal();
    } catch(e) {
      this.errorMessage.set('Failed to update profile.');
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
    } catch(e) {
      this.errorMessage.set('Failed to delete account. Please log out and log back in.');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleTheme() {
    this.theme.update(t => t === 'dark' ? 'light' : 'dark');
  }
}