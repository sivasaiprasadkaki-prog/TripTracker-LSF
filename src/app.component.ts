import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  computed,
  effect,
  OnInit,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
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
}

type View =
  | 'login'
  | 'register'
  | 'verifyEmail'
  | 'forgotPassword'
  | 'resetLinkSent';

type Theme = 'light' | 'dark';
type ProfileModalView = 'view' | 'edit' | 'deleteConfirm';

declare var XLSX: any;
declare var jspdf: any;

/* ---------- COMPONENT ---------- */

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LedgerDetailsComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class AppComponent implements OnInit {
  private fb = inject(FormBuilder);
  private elementRef = inject(ElementRef);
  firebaseService = inject(FirebaseService);

  /* ---------- AUTH ---------- */

  view = signal<View>('login');
  errorMessage = signal<string | null>(null);
  isLoading = signal(false);
  emailForMessage = signal('');

  currentUser = computed(() => this.firebaseService.currentUser());
  userProfile = computed(() => this.firebaseService.userProfile());

  /* ---------- LEDGERS ---------- */

  ledgers = signal<Ledger[]>([]);
  selectedLedger = signal<Ledger | null>(null);
  isLedgerLoading = signal(false);

  isLedgerModalVisible = signal(false);
  editingLedger = signal<Ledger | null>(null);

  ledgerToDelete = signal<Ledger | null>(null);

  modalTitle = computed(() =>
    this.editingLedger() ? 'Edit Ledger' : 'Create New Ledger'
  );
  modalSubmitButtonText = computed(() =>
    this.editingLedger() ? 'Update' : 'Create'
  );

  /* ---------- PROFILE & REPORTS ---------- */

  isProfileModalVisible = signal(false);
  isProfileDropdownVisible = signal(false);
  isReportsDropdownVisible = signal(false);

  isExportingExcel = signal(false);
  isExportingPdf = signal(false);

  profileModalView = signal<ProfileModalView>('view');
  profilePhotoFile = signal<File | null>(null);
  profilePhotoPreview = signal<string | null>(null);

  /* ---------- UI ---------- */

  loginPasswordVisible = signal(false);
  registerPasswordVisible = signal(false);
  registerRepeatPasswordVisible = signal(false);

  /* ---------- THEME ---------- */

  theme = signal<Theme>('dark');

  constructor() {
    /* theme */
    effect(() => {
      document.documentElement.classList.toggle(
        'dark',
        this.theme() === 'dark'
      );
    });

    /* 🔥 load ledgers after login */
    effect(async () => {
      const user = this.currentUser();
      if (!user) {
        this.ledgers.set([]);
        this.selectedLedger.set(null);
        return;
      }

      const data = await this.firebaseService.getLedgers();
      this.ledgers.set(
        data.map((l: any) => ({
          ...l,
          createdAt: l.createdAt?.toDate
            ? l.createdAt.toDate()
            : new Date(l.createdAt),
        }))
      );
    });
  }

  ngOnInit() {}

  /* ---------- CLICK OUTSIDE ---------- */

  onDocumentClick(event: MouseEvent) {
    if (
      this.isProfileDropdownVisible() &&
      !this.elementRef.nativeElement
        .querySelector('.profile-menu-container')
        ?.contains(event.target)
    ) {
      this.isProfileDropdownVisible.set(false);
    }

    if (
      this.isReportsDropdownVisible() &&
      !this.elementRef.nativeElement
        .querySelector('.reports-menu-container')
        ?.contains(event.target)
    ) {
      this.isReportsDropdownVisible.set(false);
    }
  }

  /* ---------- FORMS ---------- */

  static passwordsMatch(control: AbstractControl): ValidationErrors | null {
    return control.get('password')?.value ===
      control.get('repeatPassword')?.value
      ? null
      : { mismatch: true };
  }

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  registerForm = this.fb.group(
    {
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      repeatPassword: ['', Validators.required],
    },
    { validators: AppComponent.passwordsMatch }
  );

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
  
  async onLogin() {
    if (this.loginForm.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const { email, password } = this.loginForm.value;
      await this.firebaseService.login(email!, password!);
    } catch (error: any) {
      this.errorMessage.set(this.formatFirebaseError(error.message));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onRegister() {
    if (this.registerForm.invalid) {
      if (this.registerForm.hasError('mismatch')) {
        this.errorMessage.set('Passwords do not match.');
      }
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const { name, email, password } = this.registerForm.value;
      await this.firebaseService.register(name!, email!, password!);
      this.emailForMessage.set(email!);
      this.view.set('verifyEmail');
    } catch (error: any) {
      this.errorMessage.set(this.formatFirebaseError(error.message));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onForgotPassword() {
    if (this.forgotPasswordForm.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const email = this.forgotPasswordForm.value.email!;
      await this.firebaseService.sendPasswordReset(email);
      this.emailForMessage.set(email);
      this.view.set('resetLinkSent');
    } catch (error: any) {
      this.errorMessage.set(this.formatFirebaseError(error.message));
    } finally {
      this.isLoading.set(false);
    }
  }

  logout() {
    this.isProfileDropdownVisible.set(false);
    this.firebaseService.logout();
    this.view.set('login');
  }

  private formatFirebaseError(message: string): string {
    return message.replace('Firebase: ', '').replace(/\\(.*?\\)/, '');
  }

  /* ---------- UI/VIEW HELPERS ---------- */

  switchToLogin() { this.view.set('login'); this.errorMessage.set(null); }
  switchToRegister() { this.view.set('register'); this.errorMessage.set(null); }
  switchToForgotPassword() { this.view.set('forgotPassword'); this.errorMessage.set(null); }
  toggleLoginPasswordVisibility() { this.loginPasswordVisible.update(v => !v); }
  toggleRegisterPasswordVisibility() { this.registerPasswordVisible.update(v => !v); }
  toggleRegisterRepeatPasswordVisibility() { this.registerRepeatPasswordVisible.update(v => !v); }


  /* ---------- LEDGER CRUD ---------- */

  openLedgerModal(ledger: Ledger | null = null) {
    this.editingLedger.set(ledger);
    this.createLedgerForm.patchValue({
      name: ledger?.name || '',
    });
    this.isLedgerModalVisible.set(true);
  }

  closeLedgerModal() {
    this.isLedgerModalVisible.set(false);
    this.editingLedger.set(null);
    this.createLedgerForm.reset();
  }

  async onSaveLedger() {
    if (this.createLedgerForm.invalid) return;

    const name = this.createLedgerForm.value.name!;
    const editing = this.editingLedger();

    try {
      if (editing) {
        const updated = { ...editing, name };
        await this.firebaseService.saveLedger(editing.id, updated);
        this.ledgers.update(list =>
          list.map(l => (l.id === editing.id ? updated : l))
        );
      } else {
        const id = crypto.randomUUID();
        const ledger: Omit<Ledger, 'id'> & { id: string } = {
          id,
          name,
          createdAt: new Date(),
        };
        await this.firebaseService.saveLedger(id, ledger);
        this.ledgers.update(list => [...list, ledger]);
      }
      this.closeLedgerModal();
    } catch {
      this.errorMessage.set('Failed to save ledger');
    }
  }

  deleteLedger(ledger: Ledger) {
    this.ledgerToDelete.set(ledger);
  }

  cancelDeleteLedger() {
    this.ledgerToDelete.set(null);
  }

  async confirmDeleteLedger() {
    const ledger = this.ledgerToDelete();
    if (!ledger) return;

    try {
      await this.firebaseService.deleteLedger(ledger.id);

      this.ledgers.update(list =>
        list.filter(l => l.id !== ledger.id)
      );

      if (this.selectedLedger()?.id === ledger.id) {
        this.selectedLedger.set(null);
      }
    } finally {
      this.ledgerToDelete.set(null);
    }
  }

  selectLedger(ledger: Ledger) {
    if (this.isLedgerLoading()) return;

    this.isLedgerLoading.set(true);
    setTimeout(() => {
      this.selectedLedger.set(ledger);
      this.isLedgerLoading.set(false);
    }, 600);
  }

  goHome() {
    this.selectedLedger.set(null);
  }
  
  /* ---------- PROFILE & REPORTS ---------- */
  
  toggleProfileDropdown() {
    this.isProfileDropdownVisible.update(v => !v);
  }
  
  toggleReportsDropdown() {
    this.isReportsDropdownVisible.update(v => !v);
  }
  
  openProfileModal() {
    this.isProfileDropdownVisible.set(false);
    this.profileModalView.set('view');
    this.editProfileForm.patchValue({ name: this.userProfile()?.name });
    this.isProfileModalVisible.set(true);
  }

  closeProfileModal() {
    this.isProfileModalVisible.set(false);
    this.profilePhotoFile.set(null);
    this.profilePhotoPreview.set(null);
  }
  
  switchToEditProfile() {
    this.editProfileForm.patchValue({ name: this.userProfile()?.name });
    this.profileModalView.set('edit');
  }

  onProfilePhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.profilePhotoFile.set(file);
      const reader = new FileReader();
      reader.onload = () => this.profilePhotoPreview.set(reader.result as string);
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
        photoFile: this.profilePhotoFile()
      });
      this.profileModalView.set('view');
    } catch (error: any) {
      this.errorMessage.set(this.formatFirebaseError(error.message));
    } finally {
      this.isLoading.set(false);
      this.profilePhotoFile.set(null);
      this.profilePhotoPreview.set(null);
    }
  }
  
  async onDeleteAccount() {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.firebaseService.deleteUserAccount();
      this.closeProfileModal();
    } catch (error: any) {
       this.errorMessage.set(this.formatFirebaseError(error.message));
    } finally {
      this.isLoading.set(false);
    }
  }
  
  /* ---------- EXPORTS ---------- */
  
  async exportToExcel() {
    this.isExportingExcel.set(true);
    this.isReportsDropdownVisible.set(false);

    await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js');

    const ledger = this.selectedLedger();
    if (!ledger) {
      this.isExportingExcel.set(false);
      return;
    }
    
    // FIX: Cast entries to Entry[] to resolve type errors for properties like date, time, amount, etc.
    const entries = (await this.firebaseService.getEntries(ledger.id)) as Entry[];
    
    const sortedEntries = [...entries].sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`).getTime();
        const dateB = new Date(`${b.date}T${b.time}`).getTime();
        return dateA - dateB;
    });

    const entriesExportData = sortedEntries.map(entry => ({
      'Date': entry.date,
      'Details': entry.details,
      'Category': entry.category,
      'Mode': entry.mode,
      'Cash In': entry.type === 'cash-in' ? entry.amount : '',
      'Cash Out': entry.type === 'cash-out' ? entry.amount : ''
    }));

    const totalCashIn = entries.filter(e => e.type === 'cash-in').reduce((sum, e) => sum + e.amount, 0);
    const totalCashOut = entries.filter(e => e.type === 'cash-out').reduce((sum, e) => sum + e.amount, 0);
    const balance = totalCashIn - totalCashOut;
    
    const entriesSheet = XLSX.utils.json_to_sheet(entriesExportData);

    // Add summary rows at the bottom of the sheet
    XLSX.utils.sheet_add_aoa(entriesSheet, [
      [], // Empty row for spacing
      ['', '', '', 'Total', totalCashIn, totalCashOut],
      ['', '', '', 'Balance', balance]
    ], { origin: -1 });
    
    entriesSheet['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 12 }];
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, entriesSheet, 'Entries');

    XLSX.writeFile(workbook, `${ledger.name}.xlsx`);
    this.isExportingExcel.set(false);
  }

  private async getBase64ImageFromUrl(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async exportToPdf() {
    this.isExportingPdf.set(true);
    this.isReportsDropdownVisible.set(false);
    
    await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.3.1/jspdf.umd.min.js');
    
    const ledger = this.selectedLedger();
    if (!ledger) {
        this.isExportingPdf.set(false);
        return;
    }
    
    // FIX: Cast entries to Entry[] to resolve type errors for properties like attachments, details, etc.
    const entries = (await this.firebaseService.getEntries(ledger.id)) as Entry[];

    const doc = new jspdf.jsPDF();
    const entriesWithAttachments = entries.filter(e => e.attachments && e.attachments.length > 0);

    if (entriesWithAttachments.length === 0) {
        doc.text("No attachments found in this ledger.", 15, 20);
        doc.save(`${ledger.name} - Attachments.pdf`);
        this.isExportingPdf.set(false);
        return;
    }

    let isFirstPage = true;
    for (const entry of entriesWithAttachments) {
        for (const attachment of entry.attachments!) {
            if (!isFirstPage) {
                doc.addPage();
            }
            
            doc.setFontSize(16);
            doc.text(`Entry: ${entry.details}`, 15, 20);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Date: ${entry.date} at ${entry.time}`, 15, 28);
            doc.text(`Amount: ${entry.type === 'cash-in' ? '+' : '-'}${entry.amount.toFixed(2)}`, 15, 34);
            doc.text(`Category: ${entry.category}`, 15, 40);
            doc.setTextColor(0);

            try {
                const imgData = await this.getBase64ImageFromUrl(attachment);
                const mimeType = imgData.substring(imgData.indexOf(':') + 1, imgData.indexOf(';'));
                const format = mimeType.split('/')[1]?.toUpperCase();

                if (!format || !['PNG', 'JPG', 'JPEG', 'WEBP'].includes(format)) {
                   throw new Error('Unsupported image format');
                }

                const img = new Image();
                img.src = imgData;
                await new Promise<void>((resolve, reject) => { 
                  img.onload = () => resolve(); 
                  img.onerror = () => reject(new Error('Image could not be loaded into Image element')); 
                });

                const pageHeight = doc.internal.pageSize.height;
                const pageWidth = doc.internal.pageSize.width;
                const margin = 15;
                const availableWidth = pageWidth - (2 * margin);
                const availableHeight = pageHeight - 60;
                
                let imgWidth = img.width;
                let imgHeight = img.height;
                
                const ratio = Math.min(availableWidth / imgWidth, availableHeight / imgHeight);
                imgWidth *= ratio;
                imgHeight *= ratio;
                
                const x = (pageWidth - imgWidth) / 2;
                const y = 50;

                doc.addImage(imgData, format === 'JPG' ? 'JPEG' : format, x, y, imgWidth, imgHeight);
            } catch (e) {
                doc.setTextColor(255, 0, 0);
                doc.text('Could not load or display image for this entry.', 15, 60);
                doc.setTextColor(0);
                console.error("Error adding image to PDF:", e);
            }

            isFirstPage = false;
        }
    }
    
    doc.save(`${ledger.name} - Attachments.pdf`);
    this.isExportingPdf.set(false);
}

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Script load error for ${url}`));
      document.body.appendChild(script);
    });
  }


  /* ---------- THEME ---------- */

  toggleTheme() {
    this.theme.update(t => (t === 'dark' ? 'light' : 'dark'));
  }
}