
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  IonHeader,
  IonIcon,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonCard,
  IonCardContent
} from '@ionic/angular';

import {
  Appointment,
  DatabaseService,
  PetRecord,
  isVaccinated
} from '../services/database.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    IonHeader,
    IonIcon,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonCard,
    IonCardContent
  ]
})
export class ReportsPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  pets: PetRecord[] = [];
  appointments: Appointment[] = [];

  constructor(private db: DatabaseService) {}

  ionViewWillEnter(): void {
    void this.loadReports();
  }

  async loadReports(): Promise<void> {
    try {
      [this.pets, this.appointments] = await Promise.all([
        this.db.getPets(),
        this.db.getAppointments()
      ]);
    } catch {
      this.pets = [];
      this.appointments = [];
    }

    this.cdr.markForCheck();
  }

  private normalize(value?: string): string {
    return (value || '').trim().toLowerCase();
  }

  get totalPets(): number {
    return this.pets.length;
  }

  get vaccinated(): number {
    return this.pets.filter(pet => isVaccinated(pet)).length;
  }

  get notVaccinated(): number {
    return this.totalPets - this.vaccinated;
  }

  get dogs(): number {
    return this.pets.filter(pet => {
      return this.normalize(pet.petType) === 'dog';
    }).length;
  }

  get cats(): number {
    return this.pets.filter(pet => {
      return this.normalize(pet.petType) === 'cat';
    }).length;
  }

  get otherPets(): number {
    return this.totalPets - this.dogs - this.cats;
  }

  get totalAppointments(): number {
    return this.appointments.length;
  }
}
