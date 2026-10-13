import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonItem } from '@ionic/angular/ion-item';
import { IonSelect } from '@ionic/angular/ion-select';
import { IonSelectOption } from '@ionic/angular/ion-select-option';
import { IonInput } from '@ionic/angular/ion-input';
import { IonButton } from '@ionic/angular/ion-button';
import { IonIcon } from '@ionic/angular/ion-icon';
import { IonCard } from '@ionic/angular/ion-card';
import { IonCardContent } from '@ionic/angular/ion-card-content';

interface Pet {
  petName: string;
}

interface Appointment {
  id: number;
  petName: string;
  doctorName: string;
  date: string;
  time: string;
}

@Component({
  selector: 'app-appointments',
  templateUrl: './appointments.page.html',
  styleUrls: ['./appointments.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent
  ]
})
export class AppointmentsPage {
  pets: Pet[] = [];
  appointments: Appointment[] = [];

  petName = '';
  doctorName = '';
  date = '';
  time = '';

  ionViewWillEnter(): void {
    this.loadPets();
    this.loadAppointments();
  }

  loadPets(): void {
    try {
      this.pets = JSON.parse(
        localStorage.getItem('petRecords') || '[]'
      );
    } catch {
      this.pets = [];
    }
  }

  loadAppointments(): void {
    try {
      const saved = JSON.parse(
        localStorage.getItem('appointments') || '[]'
      );

      this.appointments = saved.map(
        (appointment: Partial<Appointment>, index: number) => ({
          ...appointment,
          id: appointment.id ?? Date.now() + index
        })
      );

      localStorage.setItem(
        'appointments',
        JSON.stringify(this.appointments)
      );
    } catch {
      this.appointments = [];
    }
  }

  saveAppointment(): void {
    if (!this.petName || !this.doctorName || !this.date || !this.time) {
      alert('Please complete all appointment details.');
      return;
    }

    const appointment: Appointment = {
      id: Date.now(),
      petName: this.petName,
      doctorName: this.doctorName,
      date: this.date,
      time: this.time
    };

    this.appointments.push(appointment);

    localStorage.setItem(
      'appointments',
      JSON.stringify(this.appointments)
    );

    alert('Appointment saved successfully!');

    this.petName = '';
    this.doctorName = '';
    this.date = '';
    this.time = '';
  }

  deleteAppointment(id: number): void {
    const confirmed = confirm(
      'Are you sure you want to delete this appointment?'
    );

    if (!confirmed) {
      return;
    }

    this.appointments = this.appointments.filter(
      appointment => appointment.id !== id
    );

    localStorage.setItem(
      'appointments',
      JSON.stringify(this.appointments)
    );
  }
}