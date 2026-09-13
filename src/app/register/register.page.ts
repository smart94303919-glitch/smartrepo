import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: 'register.page.html',
  styleUrls: ['register.page.scss'],
})
export class RegisterPage {
  registrationForm!: FormGroup;
  isSubmitting = false;
  formErrors: { [key: string]: string } = {};

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private supabaseService: SupabaseService,
    private toastController: ToastController
  ) {
    this.initializeForm();
  }

  initializeForm() {
    this.registrationForm = this.fb.group({
      p_log: ['', [Validators.required, Validators.minLength(2)]],
      first_name: ['', [Validators.required, Validators.minLength(2)]],
      middle_name: ['', Validators.required],
      last_name: ['', [Validators.required, Validators.minLength(2)]],
      gender: ['', Validators.required],
      age: ['', [Validators.required, Validators.min(18), Validators.max(100)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registrationForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.registrationForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) {
      return `${this.formatFieldName(fieldName)} is required`;
    }
    if (field.errors['minlength']) {
      return `${this.formatFieldName(fieldName)} must be at least ${field.errors['minlength'].requiredLength} characters`;
    }
    if (field.errors['min']) {
      return `Age must be at least ${field.errors['min'].min}`;
    }
    if (field.errors['max']) {
      return `Age cannot exceed ${field.errors['max'].max}`;
    }
    if (field.errors['email']) {
      return 'Please enter a valid email address';
    }

    return 'Invalid input';
  }

  private formatFieldName(name: string): string {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  areAllFieldsFilled(): boolean {
    return this.registrationForm.valid;
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

  async onRegister() {
    Object.keys(this.registrationForm.controls).forEach(key => {
      this.registrationForm.get(key)?.markAsTouched();
    });

    if (!this.registrationForm.valid) {
      await this.showToast('Please fill all required fields correctly', 'warning');
      return;
    }

    this.isSubmitting = true;

    try {
      // Register the professor (prof_id will be auto-generated in DB)
      const result = await this.supabaseService.registerProfessor(this.registrationForm.value);

      if (result.success) {
        await this.showToast('Registration successful!', 'success');
        this.registrationForm.reset();
        // this.router.navigate(['/login']);
      } else {
        await this.showToast(`Registration failed: ${result.error}`, 'danger');
      }
    } catch (error: any) {
      await this.showToast(`Error: ${error.message}`, 'danger');
    } finally {
      this.isSubmitting = false;
    }
  }

  onCancel() {
    this.registrationForm.reset();
    Object.keys(this.registrationForm.controls).forEach(key => {
      this.registrationForm.get(key)?.markAsUntouched();
    });
  }

  onLogin() {
    this.router.navigate(['/login']);
  }
}
