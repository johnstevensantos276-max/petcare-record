import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
IonHeader,
IonToolbar,
IonTitle,
IonContent,
IonItem,
IonInput,
IonSelect,
IonSelectOption,
IonTextarea,
IonButton
} from '@ionic/angular';

@Component({
selector: 'app-pet-registration',
templateUrl: './pet-registration.page.html',
styleUrls: ['./pet-registration.page.scss'],
standalone: true,
imports: [
CommonModule,
FormsModule,
IonHeader,
IonToolbar,
IonTitle,
IonContent,
IonItem,
IonInput,
IonSelect,
IonSelectOption,
IonTextarea,
IonButton
]
})
export class PetRegistrationPage {

petName = '';
birthday = '';
petType = '';
breed = '';
ownerName = '';
vaccinationStatus = '';
medicalNotes = '';

constructor(private router: Router) {}

savePet() {

if (
  !this.petName ||
  !this.birthday ||
  !this.petType ||
  !this.ownerName ||
  !this.vaccinationStatus
) {
  alert('Please complete all required fields.');
  return;
}

const newPet = {
  id: Date.now(),
  petName: this.petName,
  birthday: this.birthday,
  petType: this.petType,
  breed: this.breed,
  ownerName: this.ownerName,
  vaccinationStatus: this.vaccinationStatus,
  medicalNotes: this.medicalNotes
};

const savedPets = localStorage.getItem('petRecords');

const pets = savedPets
  ? JSON.parse(savedPets)
  : [];

pets.push(newPet);

localStorage.setItem('petRecords', JSON.stringify(pets));

alert('Pet registered successfully!');

this.router.navigate(['/dashboard']);

}

cancel() {
this.router.navigate(['/dashboard']);
}
}