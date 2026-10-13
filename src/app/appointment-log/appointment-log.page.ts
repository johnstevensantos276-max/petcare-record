import { Component } from '@angular/core';
import { Router } from '@angular/router';

import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { IonButton } from '@ionic/angular/ion-button';
import { IonIcon } from '@ionic/angular/ion-icon';

interface Appointment {
  petName: string;
  doctorName: string;
  date: string;
  time: string;
}

@Component({
  selector: 'app-appointment-log',
  templateUrl: './appointment-log.page.html',
  styleUrls: ['./appointment-log.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonIcon
  ]
})
export class AppointmentLogPage {
  appointments: Appointment[] = [];

  constructor(private router: Router) {}

  ionViewWillEnter(): void {
    this.loadAppointments();
  }

  loadAppointments(): void {
    const savedAppointments = localStorage.getItem('appointments');

    if (savedAppointments) {
      try {
        this.appointments = JSON.parse(savedAppointments);
      } catch {
        this.appointments = [];
      }
    } else {
      this.appointments = [];
    }
  }

  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}