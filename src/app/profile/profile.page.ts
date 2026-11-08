import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar
} from '@ionic/angular';

import {
  DatabaseService,
  PASSWORD_RULE,
  PIN_RULE,
  User,
  isPin,
  isStrongPassword
} from '../services/database.service';
import { NotifyService } from '../services/notify.service';
import { ThemeService } from '../services/theme.service';

// Settings (side menu): dark mode, and the user's own account: change name,
// password and Recovery PIN without logging out. Password and PIN changes
// need the current password or PIN.
@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar
  ]
})
export class ProfilePage {
  // The app is zoneless: refresh the view after async calls.
  private cdr = inject(ChangeDetectorRef);

  user: User | null = null;

  fullName = '';
  savingName = false;

  // Change password
  passwordVerify = '';
  newPassword = '';
  confirmPassword = '';
  showPassword = false;
  savingPassword = false;
  passwordError = '';

  // Change Recovery PIN
  pinVerify = '';
  newPin = '';
  savingPin = false;
  pinError = '';

  constructor(
    private db: DatabaseService,
    private notify: NotifyService,
    readonly theme: ThemeService
  ) {}

  async ionViewWillEnter(): Promise<void> {
    this.user = await this.db.getCurrentUser();
    this.fullName = this.user?.fullName ?? '';
    this.passwordVerify = this.newPassword = this.confirmPassword = '';
    this.pinVerify = this.newPin = '';
    this.passwordError = this.pinError = '';
    this.cdr.markForCheck();
  }

  get initial(): string {
    return (this.user?.fullName ?? '').trim().charAt(0).toUpperCase() || '?';
  }

  get accountLabel(): string {
    switch (this.user?.accountType) {
      case 'google':
        return 'Google sign-in';
      case 'facebook':
        return 'Facebook sign-in';
      default:
        return 'Email and password';
    }
  }

  get accountIcon(): string {
    switch (this.user?.accountType) {
      case 'google':
        return 'logo-google';
      case 'facebook':
        return 'logo-facebook';
      default:
        return 'mail-outline';
    }
  }

  get nameChanged(): boolean {
    return this.fullName.trim() !== (this.user?.fullName ?? '') && !!this.fullName.trim();
  }

  async saveName(): Promise<void> {
    if (!this.nameChanged || this.savingName) {
      return;
    }

    this.savingName = true;
    this.cdr.markForCheck();

    try {
      this.user = await this.db.updateProfile(this.fullName.trim());
      this.fullName = this.user.fullName;
      void this.notify.success('Your name was updated.');
    } catch (error) {
      void this.notify.error(error instanceof Error ? error.message : 'Unable to save your name.');
    }

    this.savingName = false;
    this.cdr.markForCheck();
  }

  async savePassword(): Promise<void> {
    if (this.savingPassword) {
      return;
    }

    this.passwordError = '';

    if (!this.passwordVerify || !this.newPassword || !this.confirmPassword) {
      this.passwordError = 'Please complete all fields.';
      return;
    }

    if (!isStrongPassword(this.newPassword)) {
      this.passwordError = PASSWORD_RULE;
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'Passwords do not match.';
      return;
    }

    this.savingPassword = true;
    this.cdr.markForCheck();

    try {
      await this.db.changePassword(this.passwordVerify, this.newPassword);
      this.passwordVerify = this.newPassword = this.confirmPassword = '';
      void this.notify.success('Password changed. Other devices will need to log in again.');
    } catch (error) {
      this.passwordError = error instanceof Error ? error.message : 'Unable to change the password.';
    }

    this.savingPassword = false;
    this.cdr.markForCheck();
  }

  async savePin(): Promise<void> {
    if (this.savingPin) {
      return;
    }

    this.pinError = '';

    if (!this.pinVerify || !this.newPin) {
      this.pinError = 'Please complete all fields.';
      return;
    }

    if (!isPin(this.newPin)) {
      this.pinError = PIN_RULE;
      return;
    }

    this.savingPin = true;
    this.cdr.markForCheck();

    try {
      await this.db.changePin(this.pinVerify, this.newPin);
      this.pinVerify = this.newPin = '';
      this.user = await this.db.getCurrentUser();
      void this.notify.success('Your Recovery PIN was saved.');
    } catch (error) {
      this.pinError = error instanceof Error ? error.message : 'Unable to save the PIN.';
    }

    this.savingPin = false;
    this.cdr.markForCheck();
  }
}
