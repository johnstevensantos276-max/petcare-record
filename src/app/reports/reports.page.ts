import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { IonButton } from '@ionic/angular/ion-button';
import { IonCard } from '@ionic/angular/ion-card';
import { IonCardContent } from '@ionic/angular/ion-card-content';

interface Pet {
  petName: string;
  petType?: string;
  breed?: string;
  birthday?: string;
  ownerName?: string;
  vaccinationStatus?: string;
  medicalNotes?: string;
}

interface Appointment {
  petName: string;
  doctorName: string;
  date: string;
  time: string;
}

@Component({
  selector: 'app-reports',
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonCard,
    IonCardContent
  ]
})
export class ReportsPage {
  pets: Pet[] = [];
  appointments: Appointment[] = [];

  constructor(private router: Router) {}

  ionViewWillEnter(): void {
    this.loadReports();
  }

  loadReports(): void {
    try {
      this.pets = JSON.parse(
        localStorage.getItem('petRecords') || '[]'
      );
    } catch {
      this.pets = [];
    }

    try {
      this.appointments = JSON.parse(
        localStorage.getItem('appointments') || '[]'
      );
    } catch {
      this.appointments = [];
    }
  }

  get totalPets(): number {
    return this.pets.length;
  }

  get vaccinated(): number {
    return this.pets.filter(pet => {
      const status = (pet.vaccinationStatus || '').toLowerCase();
      return status === 'vaccinated' || status === 'yes';
    }).length;
  }

  get notVaccinated(): number {
    return this.pets.filter(pet => {
      const status = (pet.vaccinationStatus || '').toLowerCase();
      return status !== 'vaccinated' && status !== 'yes';
    }).length;
  }

  get dogs(): number {
    return this.pets.filter(pet =>
      (pet.petType || '').toLowerCase() === 'dog'
    ).length;
  }

  get cats(): number {
    return this.pets.filter(pet =>
      (pet.petType || '').toLowerCase() === 'cat'
    ).length;
  }

  get otherPets(): number {
    return this.pets.filter(pet => {
      const type = (pet.petType || '').toLowerCase();
      return type !== 'dog' && type !== 'cat';
    }).length;
  }

  get totalAppointments(): number {
    return this.appointments.length;
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}