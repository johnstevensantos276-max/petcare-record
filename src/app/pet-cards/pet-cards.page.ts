import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { IonButton } from '@ionic/angular/ion-button';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonCard } from '@ionic/angular/ion-card';
import { IonCardContent } from '@ionic/angular/ion-card-content';
import { IonCardHeader } from '@ionic/angular/ion-card-header';
import { IonCardTitle } from '@ionic/angular/ion-card-title';
import { IonItem } from '@ionic/angular/ion-item';
import { IonLabel } from '@ionic/angular/ion-label';
import { IonSelect } from '@ionic/angular/ion-select';
import { IonSelectOption } from '@ionic/angular/ion-select-option';
import { IonBadge } from '@ionic/angular/ion-badge';

interface Pet {
  petName: string;
  birthday?: string;
  petType?: string;
  breed?: string;
  ownerName?: string;
  vaccinationStatus?: string;
  medicalNotes?: string;
}

@Component({
  selector: 'app-pet-cards',
  templateUrl: './pet-cards.page.html',
  styleUrls: ['./pet-cards.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonBadge
  ]
})
export class PetCardsPage {
  pets: Pet[] = [];
  selectedPetType = 'All';

  constructor(private router: Router) {}

  ionViewWillEnter(): void {
    this.loadPets();
  }

  loadPets(): void {
    try {
      const savedPets = localStorage.getItem('petRecords');
      this.pets = savedPets ? JSON.parse(savedPets) : [];
    } catch {
      this.pets = [];
    }
  }

  get filteredPets(): Pet[] {
    if (this.selectedPetType === 'All') {
      return this.pets;
    }

    return this.pets.filter(
      pet =>
        (pet.petType || '').toLowerCase() ===
        this.selectedPetType.toLowerCase()
    );
  }

  get petTypes(): string[] {
    const types = this.pets
      .map(pet => pet.petType)
      .filter((type): type is string => !!type);

    return ['All', ...new Set(types)];
  }

  isVaccinated(pet: Pet): boolean {
    const status = (pet.vaccinationStatus || '').toLowerCase();

    return status === 'vaccinated' || status === 'yes';
  }

  deletePet(pet: Pet): void {
    const confirmed = window.confirm(
      `Delete the record for ${pet.petName}?`
    );

    if (!confirmed) {
      return;
    }

    this.pets = this.pets.filter(item => item !== pet);

    localStorage.setItem(
      'petRecords',
      JSON.stringify(this.pets)
    );
  }

  goToRegistration(): void {
    this.router.navigate(['/pet-registration']);
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}