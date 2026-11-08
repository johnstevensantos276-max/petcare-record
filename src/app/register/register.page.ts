import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import {
  DatabaseService,
  PASSWORD_RULE,
  PIN_RULE,
  User,
  isEmail,
  isPin,
  isStrongPassword,
  normalizeLogin
} from '../services/database.service';
import { SocialLoginComponent } from '../social-login/social-login.component';

@Component({
selector: 'app-register',
templateUrl: './register.page.html',
styleUrls: ['../login/login.page.scss', './register.page.scss'],
standalone: true,
imports: [
CommonModule,
FormsModule,
RouterLink,
IonContent,
IonIcon,
SocialLoginComponent
]
})
export class RegisterPage {
// The app is zoneless: refresh the view after async database calls.
private cdr = inject(ChangeDetectorRef);

fullName = '';
username = '';
password = '';
confirmPassword = '';
// 4 numbers the user picks; needed for Forgot Password.
recoveryPin = '';
showPassword = false;

loading = false;
success = false;
shake = false;
errorMessage = '';

constructor(private router: Router, private db: DatabaseService) {}

ionViewWillEnter() {
this.loading = false;
this.success = false;
this.errorMessage = '';
}

clearError() {
this.errorMessage = '';
}

// The Google / Facebook window already made the account and logged in.
onSocialLogin(user: User) {
this.router.navigate(['/dashboard'], { replaceUrl: true });
}

async register() {
if (this.loading) {
  return;
}

if (
  !this.fullName.trim() ||
  !this.username.trim() ||
  !this.password ||
  !this.confirmPassword ||
  !this.recoveryPin
) {
  this.fail('Please complete all fields.');
  return;
}

// The username is the email address the user signs in with.
if (!isEmail(this.username)) {
  this.fail('Please enter a valid email address.');
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

if (!isPin(this.recoveryPin)) {
  this.fail(PIN_RULE);
  return;
}

this.loading = true;
this.errorMessage = '';

try {
  await this.db.register({
    fullName: this.fullName.trim(),
    username: normalizeLogin(this.username),
    password: this.password,
    recoveryPin: this.recoveryPin
  });
} catch (error) {
  this.loading = false;
  this.fail(error instanceof Error ? error.message : 'Unable to register.');
  return;
}

const username = normalizeLogin(this.username);
this.success = true;
this.cdr.markForCheck();

// Let the success animation play before going back to login.
await new Promise(resolve => setTimeout(resolve, 1400));

this.fullName = '';
this.username = '';
this.password = '';
this.confirmPassword = '';
this.recoveryPin = '';
this.loading = false;
this.success = false;

this.router.navigate(['/login'], { state: { username } });
}

onShakeEnd(event: AnimationEvent) {
// Ignore animations that bubble up from the fields inside the card.
if (event.target === event.currentTarget) {
  this.shake = false;
}
}

private fail(message: string) {
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
