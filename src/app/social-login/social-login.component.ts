import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';

import {
  DatabaseService,
  PIN_RULE,
  User,
  isEmail,
  isFacebookLogin,
  isPin,
  normalizeLogin
} from '../services/database.service';

type Provider = 'google' | 'facebook';

// "Continue with Google / Facebook" for Login and Register. It looks like
// those sign-ins but is not connected to the real Google or Facebook: just
// an email, a PetCare password and (the first time) a Recovery PIN. The
// first time, the account is made by itself; after that the same password
// is needed.
@Component({
  selector: 'app-social-login',
  templateUrl: './social-login.component.html',
  styleUrls: ['./social-login.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon]
})
export class SocialLoginComponent implements AfterViewInit, OnDestroy {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  @Input() disabled = false;
  @Output() loggedIn = new EventEmitter<User>();

  @ViewChild('sheetLayer') sheetLayer?: ElementRef<HTMLElement>;

  provider: Provider | null = null;

  email = '';
  password = '';
  // Only used when the account is new.
  recoveryPin = '';
  showPassword = false;

  busy = false;
  errorMessage = '';

  constructor(private db: DatabaseService) {}

  // The login card is animated (transformed), which would trap a fixed
  // overlay inside it, so the window is moved to <body> to cover the screen.
  ngAfterViewInit(): void {
    if (this.sheetLayer) {
      document.body.appendChild(this.sheetLayer.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.sheetLayer?.nativeElement.remove();
  }

  get providerName(): string {
    return this.provider === 'facebook' ? 'Facebook' : 'Google';
  }

  open(provider: Provider): void {
    if (this.disabled) {
      return;
    }

    this.provider = provider;
    this.email = '';
    this.password = '';
    this.recoveryPin = '';
    this.showPassword = false;
    this.errorMessage = '';
  }

  close(): void {
    if (!this.busy) {
      this.provider = null;
    }
  }

  async submit(): Promise<void> {
    if (this.busy || !this.provider) {
      return;
    }

    const email = normalizeLogin(this.email);

    // Facebook also allows a username or mobile number, like Facebook itself.
    if (this.provider === 'facebook' ? !isFacebookLogin(email) : !isEmail(email)) {
      this.errorMessage = this.provider === 'facebook'
        ? 'Please enter your Facebook email, username or mobile number.'
        : 'Please enter your Google email.';
      return;
    }

    if (!this.password) {
      this.errorMessage = 'Please enter your password.';
      return;
    }

    if (this.recoveryPin && !isPin(this.recoveryPin)) {
      this.errorMessage = PIN_RULE;
      return;
    }

    this.busy = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    try {
      const user = await this.db.quickLogin(
        email,
        this.password,
        this.provider,
        this.recoveryPin
      );

      this.busy = false;
      this.provider = null;
      this.cdr.markForCheck();
      this.loggedIn.emit(user);
      return;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to continue.';
    }

    this.busy = false;
    this.cdr.markForCheck();
  }
}
