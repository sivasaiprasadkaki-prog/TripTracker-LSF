import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { FirebaseService } from './services/firebase.service';

type View = 'login' | 'register' | 'verifyEmail' | 'forgotPassword' | 'resetLinkSent';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent {
  private fb = inject(FormBuilder);
  firebaseService = inject(FirebaseService);

  view = signal<View>('login');
  errorMessage = signal<string | null>(null);
  isLoading = signal(false);
  emailForMessage = signal<string | null>(null);

  currentUser = computed(() => this.firebaseService.currentUser());
  
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

    const { email, password } = this.registerForm.value;
    
    try {
      await this.firebaseService.register(email!, password!);
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
      // For security, we show the success message even if the email doesn't exist
      // to prevent email enumeration attacks.
      this.emailForMessage.set(email);
      this.view.set('resetLinkSent');
    } finally {
      this.isLoading.set(false);
    }
  }

  logout() {
    this.firebaseService.logout();
    this.switchToLogin();
  }
}
