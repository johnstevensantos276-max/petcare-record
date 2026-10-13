import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonItem, IonInput, IonButton } from '@ionic/angular';

@Component({
selector: 'app-login',
templateUrl: './login.page.html',
styleUrls: ['./login.page.scss'],
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
export class LoginPage {
username = '';
password = '';

constructor(private router: Router) {}

login() {
const savedUser = localStorage.getItem('petcareUser');

if (!savedUser) {
  alert('No account found. Please register first.');
  return;
}

const user = JSON.parse(savedUser);

if (
  this.username === user.username &&
  this.password === user.password
) {
  alert('Login successful!');
this.router.navigate(['/dashboard']);


} else {
  alert('Incorrect username or password.');
}

}
}