import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonItem, IonInput, IonButton } from '@ionic/angular';

@Component({
selector: 'app-register',
templateUrl: './register.page.html',
styleUrls: ['./register.page.scss'],
standalone: true,
imports: [
CommonModule,
FormsModule,
RouterLink,
IonHeader,
IonToolbar,
IonTitle,
IonContent,
IonItem,
IonInput,
IonButton
]
})
export class RegisterPage {
fullName = '';
username = '';
password = '';
confirmPassword = '';

constructor(private router: Router) {}

register() {
if (!this.fullName || !this.username || !this.password || !this.confirmPassword) {
alert('Please complete all fields.');
return;
}

if (this.password !== this.confirmPassword) {
  alert('Passwords do not match.');
  return;
}

const user = {
  fullName: this.fullName,
  username: this.username,
  password: this.password
};

localStorage.setItem('petcareUser', JSON.stringify(user));

alert('Registration successful!');

this.router.navigate(['/login']);

}
}