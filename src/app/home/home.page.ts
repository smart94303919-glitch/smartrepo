import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnDestroy {
  loginForm!: FormGroup;
  isSubmitting = false;
  showPassword: boolean = false;
  failedAttempts: number = 0;
  isLockedOut: boolean = false;
  lockoutRemainingSeconds: number = 0;
  lockoutTimer: any = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private supabaseService: SupabaseService,
    private toastController: ToastController
  ) {
    this.initializeForm();
  }

  async handleRefresh(event: any): Promise<void> {
    try {
      await Promise.resolve();
    } finally {
      event.target.complete();
    }
  }

  initializeForm() {
    this.loginForm = this.fb.group({
      prof_number: ['', [Validators.required, Validators.minLength(1)]],
      password: ['', [Validators.required]],
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.loginForm.get(fieldName);
    if (!field || !field.errors) {
      return '';
    }

    if (field.errors['required']) {
      return `${this.formatFieldName(fieldName)} is required`;
    }
    if (field.errors['minlength']) {
      return `${this.formatFieldName(fieldName)} must be at least ${field.errors['minlength'].requiredLength} characters`;
    }
    return 'Invalid input';
  }

  private formatFieldName(name: string): string {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  get formattedLockoutTime(): string {
    const minutes = Math.floor(this.lockoutRemainingSeconds / 60);
    const seconds = this.lockoutRemainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  startLockoutTimer() {
    this.clearLockoutTimer();
    this.lockoutTimer = setInterval(() => {
      this.lockoutRemainingSeconds--;

      if (this.lockoutRemainingSeconds <= 0) {
        this.clearLockoutTimer();
        this.isLockedOut = false;
        this.lockoutRemainingSeconds = 0;
        this.failedAttempts = 0;
      }
    }, 1000);
  }

  private clearLockoutTimer() {
    if (this.lockoutTimer !== null) {
      clearInterval(this.lockoutTimer);
      this.lockoutTimer = null;
    }
  }

  async onEnter() {
    if (this.isLockedOut) {
      return;
    }

    Object.keys(this.loginForm.controls).forEach(key => {
      this.loginForm.get(key)?.markAsTouched();
    });

    if (!this.loginForm.valid) {
      await this.showToast('Please fill all required fields correctly', 'warning');
      return;
    }

    this.isSubmitting = true;

    try {
      const loginData = this.loginForm.getRawValue();
      const result = await this.supabaseService.validateLogin(loginData);

      if (result.success) {
        this.failedAttempts = 0;
        this.clearLockoutTimer();
        await this.showToast('Login successful!', 'success');
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        this.router.navigate(['/mainhome']);
      } else {
        this.failedAttempts++;

        if (this.failedAttempts < 5) {
          await this.showToast(
            `WRONG PASSWORD TRY AGAIN (Attempt ${this.failedAttempts} of 5)`,
            'danger'
          );
        } else {
          this.isLockedOut = true;
          this.lockoutRemainingSeconds = 300;
          this.startLockoutTimer();
          await this.showToast('Too many failed attempts. Login locked for 5 minutes.', 'danger');
        }
      }
    } catch (error: any) {
      await this.showToast(`Error: ${error.message}`, 'danger');
    } finally {
      this.isSubmitting = false;
    }
  }

  onForgotPassword() {
    this.router.navigate(['/forget']);
  }

  ngOnDestroy() {
    this.clearLockoutTimer();
  }
}
