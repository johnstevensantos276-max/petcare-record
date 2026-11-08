import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';

import {
  ApiError,
  DatabaseService,
  PASSWORD_RULE,
  PIN_RULE,
  isFacebookLogin,
  isPin,
  isStrongPassword,
  normalizeLogin
} from '../services/database.service';

type Step = 'reset' | 'done';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['../login/login.page.scss', './forgot-password.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonContent, IonIcon]
})
export class ForgotPasswordPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  step: Step = 'reset';

  email = '';
  pin = '';
  password = '';
  confirmPassword = '';
  showPassword = false;

  loading = false;
  shake = false;
  errorMessage = '';

  constructor(
    private router: Router,
    private db: DatabaseService
  ) {}

  ionViewWillEnter(): void {
    this.step = 'reset';
    this.pin = '';
    this.password = '';
    this.confirmPassword = '';
    this.errorMessage = '';
    this.loading = false;
    this.cdr.markForCheck();
  }

  clearError(): void {
    this.errorMessage = '';
  }

  async resetPassword(): Promise<void> {
    if (this.loading) {
      return;
    }

    const email = normalizeLogin(this.email);

    if (!email || !this.pin || !this.password || !this.confirmPassword) {
      this.fail('Please complete all fields.');
      return;
    }

    // Email, or the Facebook username / mobile number used to sign in.
    if (!isFacebookLogin(email)) {
      this.fail('Please enter your email, Facebook username or mobile number.');
      return;
    }

    if (!isPin(this.pin)) {
      this.fail(PIN_RULE);
      return;
    }

    if (!isStrongPassword(this.password)) {
      this.fail(PASSWORD_RULE);
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.fail('Passwords do not match.');
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    try {
      // The server checks the PIN (and locks the account after wrong tries).
      await this.db.resetPassword(email, this.pin, this.password);
      this.email = email;
      this.step = 'done';
    } catch (error) {
      console.error('Unable to reset password:', error);
      this.fail(error instanceof ApiError
        ? error.message
        : 'Unable to reset the password. Please try again.');
    }

    this.loading = false;
    this.cdr.markForCheck();
  }

  goToLogin(): void {
    const username = this.email;
    this.pin = '';
    this.password = '';
    this.confirmPassword = '';
    void this.router.navigate(['/login'], { state: { username } });
  }

  onShakeEnd(event: AnimationEvent): void {
    // Ignore animations that bubble up from the fields inside the card.
    if (event.target === event.currentTarget) {
      this.shake = false;
    }
  }

  private fail(message: string): void {
    this.errorMessage = message;
    this.shake = false;
    this.cdr.markForCheck();

    // Restart the shake animation on every failed attempt.
    requestAnimationFrame(() => {
      this.shake = true;
      this.cdr.markForCheck();
    });
  }
}
