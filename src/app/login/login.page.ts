import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { DatabaseService, User } from '../services/database.service';
import { SocialLoginComponent } from '../social-login/social-login.component';

@Component({
selector: 'app-login',
templateUrl: './login.page.html',
styleUrls: ['./login.page.scss'],
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
export class LoginPage {
// The app is zoneless: refresh the view after async database calls.
private cdr = inject(ChangeDetectorRef);

username = '';
password = '';
showPassword = false;

loading = false;
success = false;
shake = false;
errorMessage = '';
welcomeName = '';

constructor(private router: Router, private db: DatabaseService) {}

ionViewWillEnter() {
this.loading = false;
this.success = false;
this.errorMessage = '';

// Coming from Create Account: fill in the new username.
const fromRegister = history.state?.username;
if (typeof fromRegister === 'string' && fromRegister) {
  this.username = fromRegister;
  this.password = '';
}

this.cdr.markForCheck();
}

clearError() {
this.errorMessage = '';
}

// Signed in with the Google / Facebook button: same welcome as a password login.
async onSocialLogin(user: User) {
this.loading = true;
this.errorMessage = '';
await this.welcome(user);
}

async login() {
if (this.loading) {
  return;
}

if (!this.username.trim() || !this.password) {
  this.fail('Please enter your email and password.');
  return;
}

this.loading = true;
this.errorMessage = '';

try {
  const user = await this.db.login(this.username.trim(), this.password);

  if (!user) {
    this.loading = false;
    this.fail('Incorrect email or password.');
    return;
  }

  await this.welcome(user);
} catch (error) {
  console.error('Login failed:', error);
  this.loading = false;
  this.fail(`Unable to login: ${error instanceof Error ? error.message : error}`);
}
}

private async welcome(user: User) {
this.welcomeName = user.fullName;
this.success = true;
this.cdr.markForCheck();

// Let the success animation play before moving to the dashboard.
await new Promise(resolve => setTimeout(resolve, 1100));

this.username = '';
this.password = '';
this.loading = false;
this.success = false;
this.router.navigate(['/dashboard'], { replaceUrl: true });
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
