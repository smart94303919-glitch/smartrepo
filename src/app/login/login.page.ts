import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
})
export class LoginPage {
  loginForm!: FormGroup;
  isSubmitting = false; 

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
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  // Validate individual field
  isFieldInvalid(fieldName: string): boolean {
    const field = this.loginForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  // Get error message for a field
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

  // Format field name for display
  private formatFieldName(name: string): string {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // Show toast message
  async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }

  // Handle login
 async onEnter() {
  Object.keys(this.loginForm.controls).forEach(key => {
    this.loginForm.get(key)?.markAsTouched();
  });

  if (!this.loginForm.valid) {
    await this.showToast('Please fill all required fields correctly', 'warning');
    return;
  }

  this.isSubmitting = true;

  try {
    const loginData = this.loginForm.value; // { prof_number, password }

    const result = await this.supabaseService.validateLogin(loginData);

    if (result.success) {
      await this.showToast('Login successful!', 'success');
      localStorage.setItem('currentUser', JSON.stringify(result.user));
      this.router.navigate(['/mainhome']);
    } else {
      await this.showToast(`Login failed: ${result.error}`, 'danger');
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

  onGoback() {
    this.router.navigate(['/home']);
  }
}
