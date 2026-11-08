
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonButton,
  IonCard,
  IonCardContent,
  IonButtons,
  IonBackButton,
  IonDatetime,
  IonIcon,
  IonModal
} from '@ionic/angular';

import {
  APPOINTMENT_PURPOSES,
  Appointment,
  AppointmentStatus,
  DatabaseService,
  PetRecord,
  appointmentStatus,
  canMarkMissed,
  localDate,
  toDateTime
} from '../services/database.service';
import { NotifyService } from '../services/notify.service';
import { ReminderService } from '../services/reminder.service';

type StatusFilter = 'All' | AppointmentStatus;

@Component({
  selector: 'app-appointments',
  templateUrl: './appointments.page.html',
  styleUrls: ['./appointments.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonButton,
    IonCard,
    IonCardContent,
    IonButtons,
    IonBackButton,
    IonDatetime,
    IonIcon,
    IonModal
  ]
})
export class AppointmentsPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  pets: PetRecord[] = [];
  appointments: Appointment[] = [];
  showAppointments = false;
  // All by default so missed and completed ones stay in the list.
  statusFilter: StatusFilter = 'All';
  statusFilters: StatusFilter[] = ['All', 'Pending', 'Completed', 'Missed'];
  today = localDate();

  // Pending appointments turn into missed ones as time passes.
  private refreshTimer?: ReturnType<typeof setInterval>;

  // What the calendar/clock popup is choosing: the date or time, for the
  // booking form or for rescheduling.
  picker: { target: 'book' | 'reschedule'; kind: 'date' | 'time' } | null = null;

  // Rescheduling a missed appointment (only one at a time).
  reschedulingId: number | null = null;
  rescheduleDoctor = '';
  reschedulePurpose = '';
  rescheduleOther = '';
  rescheduleDate = '';
  rescheduleTime = '';

  readonly purposes = APPOINTMENT_PURPOSES;

  petId: number | null = null;
  doctorName = '';
  purpose = '';
  // Typed in when "Other" is chosen as the purpose.
  purposeOther = '';
  date = '';
  time = '';

  constructor(
    private db: DatabaseService,
    private notify: NotifyService,
    private reminders: ReminderService,
    private route: ActivatedRoute
  ) {
    // Sidebar shortcuts link here with ?status=Missed.
    this.route.queryParamMap.subscribe(params => {
      const status = params.get('status') as StatusFilter | null;

      if (status && this.statusFilters.includes(status)) {
        this.statusFilter = status;
        this.showAppointments = true;
        this.cdr.markForCheck();
      }
    });
  }

  async ionViewWillEnter(): Promise<void> {
    if (!this.route.snapshot.queryParamMap.get('status')) {
      this.showAppointments = false;
    }

    this.today = localDate();
    this.refreshTimer = setInterval(() => {
      this.today = localDate();
      this.cdr.markForCheck();
    }, 30 * 1000);

    await Promise.all([this.loadPets(), this.loadAppointments()]);
  }

  ionViewWillLeave(): void {
    clearInterval(this.refreshTimer);
  }

  get filteredAppointments(): Appointment[] {
    return this.appointments.filter(appointment =>
      this.statusFilter === 'All' ||
      this.getStatus(appointment) === this.statusFilter
    );
  }

  countByStatus(status: StatusFilter): number {
    return status === 'All'
      ? this.appointments.length
      : this.appointments.filter(item => this.getStatus(item) === status).length;
  }

  getStatus(appointment: Appointment): AppointmentStatus {
    return appointmentStatus(appointment);
  }

  canMarkMissed(appointment: Appointment): boolean {
    return canMarkMissed(appointment);
  }

  async loadPets(): Promise<void> {
    try {
      this.pets = await this.db.getPets();
    } catch {
      this.pets = [];
    }

    this.cdr.markForCheck();
  }

  async loadAppointments(): Promise<void> {
    try {
      this.appointments = await this.db.getAppointments();
    } catch {
      this.appointments = [];
    }

    this.cdr.markForCheck();
  }

  // Shows a sample reminder now, so the user can see notifications work.
  testReminder(): void {
    void this.reminders.test();
  }

  async showAppointmentList(): Promise<void> {
    this.showAppointments = true;
    await this.loadAppointments();
  }

  async saveAppointment(): Promise<void> {
    const pet = this.pets.find(item => item.id === this.petId);

    const purpose = this.purposeText(this.purpose, this.purposeOther);

    if (
      !pet ||
      !this.doctorName.trim() ||
      !purpose ||
      !this.date ||
      !this.time
    ) {
      void this.notify.error('Please complete all appointment details.');
      return;
    }

    const scheduled = toDateTime(this.date.slice(0, 10), this.time);

    if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
      void this.notify.error(
        'Appointments can only be booked for today (a later time) or a future date.'
      );
      return;
    }

    try {
      await this.db.addAppointment({
        petId: pet.id!,
        petName: pet.petName,
        doctorName: this.doctorName.trim(),
        purpose,
        date: this.date.slice(0, 10),
        time: this.time
      });

      await this.loadAppointments();
      this.showAppointments = true;
      this.statusFilter = 'All';
      this.reminders.requestPermission();

      this.petId = null;
      this.doctorName = '';
      this.purpose = '';
      this.purposeOther = '';
      this.date = '';
      this.time = '';

      void this.notify.success('Appointment saved successfully!');
    } catch (error) {
      void this.notify.error(
        error instanceof Error ? error.message : 'Unable to save appointment.'
      );
    }
  }

  async completeAppointment(id?: number): Promise<void> {
    if (
      !id ||
      !(await this.notify.confirm(
        'Complete Appointment',
        'Mark this appointment as completed?',
        'Mark Completed'
      ))
    ) {
      return;
    }

    try {
      await this.db.completeAppointment(id);
      await this.loadAppointments();
      void this.notify.success('Appointment marked as completed.');
    } catch {
      void this.notify.error('Unable to update appointment.');
    }
  }

  async missAppointment(id?: number): Promise<void> {
    if (
      !id ||
      !(await this.notify.confirm(
        'Missed Appointment',
        'Mark this appointment as missed? Use this if you could not make it.',
        'Mark Missed'
      ))
    ) {
      return;
    }

    try {
      await this.db.missAppointment(id);
      await this.loadAppointments();
      void this.notify.success('Appointment marked as missed.');
    } catch {
      void this.notify.error(
        'You can only mark an appointment as missed after its time has passed.'
      );
    }
  }

  openPicker(target: 'book' | 'reschedule', kind: 'date' | 'time'): void {
    this.picker = { target, kind };
  }

  // What is already chosen (or today / 9:00 AM), so the popup opens there.
  get pickerValue(): string {
    const rescheduling = this.picker?.target === 'reschedule';
    const date = ((rescheduling ? this.rescheduleDate : this.date) || this.today).slice(0, 10);
    const time = (rescheduling ? this.rescheduleTime : this.time) || '09:00';
    return `${date}T${time}:00`;
  }

  pickValue(event: Event): void {
    const raw = (event as CustomEvent<{ value?: string | string[] | null }>).detail.value;
    const value = Array.isArray(raw) ? raw[0] : raw ?? '';
    const rescheduling = this.picker?.target === 'reschedule';

    if (this.picker?.kind === 'time') {
      // e.g. "2026-12-24T14:30:00" -> "14:30"
      const time = value.match(/(\d{2}:\d{2})/)?.[1];

      if (time) {
        if (rescheduling) {
          this.rescheduleTime = time;
        } else {
          this.time = time;
        }
      }
    } else if (value) {
      if (rescheduling) {
        this.rescheduleDate = value.slice(0, 10);
      } else {
        this.date = value.slice(0, 10);
      }
    }

    this.picker = null;
  }

  // "14:30" -> "2:30 PM"
  formatTime(time: string): string {
    return toDateTime(this.today, time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  // "2026-12-24" -> "December 24, 2026"
  formatDate(date: string): string {
    return toDateTime(date.slice(0, 10), '00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // The chosen purpose, or what was typed when "Other" is chosen.
  private purposeText(choice: string, other: string): string {
    return choice === 'Other' ? other.trim() : choice;
  }

  startReschedule(appointment: Appointment): void {
    this.reschedulingId = appointment.id ?? null;
    this.rescheduleDoctor = appointment.doctorName;
    const known = APPOINTMENT_PURPOSES.includes(appointment.purpose ?? '');
    this.reschedulePurpose = appointment.purpose ? (known ? appointment.purpose : 'Other') : '';
    this.rescheduleOther = known ? '' : appointment.purpose ?? '';
    this.rescheduleDate = '';
    this.rescheduleTime = '';
  }

  cancelReschedule(): void {
    this.reschedulingId = null;
  }

  async saveReschedule(): Promise<void> {
    const id = this.reschedulingId;

    const purpose = this.purposeText(this.reschedulePurpose, this.rescheduleOther);

    if (
      !id ||
      !this.rescheduleDoctor.trim() ||
      !purpose ||
      !this.rescheduleDate ||
      !this.rescheduleTime
    ) {
      void this.notify.error('Please complete all appointment details.');
      return;
    }

    try {
      await this.db.rescheduleAppointment(id, {
        doctorName: this.rescheduleDoctor.trim(),
        purpose,
        date: this.rescheduleDate.slice(0, 10),
        time: this.rescheduleTime
      });

      this.reschedulingId = null;
      await this.loadAppointments();
      this.reminders.requestPermission();
      void this.notify.success('Appointment rescheduled. It is pending again.');
    } catch (error) {
      void this.notify.error(
        error instanceof Error ? error.message : 'Unable to reschedule appointment.'
      );
    }
  }

  async deleteAppointment(id?: number): Promise<void> {
    if (
      !id ||
      !(await this.notify.confirm(
        'Delete Appointment',
        'Are you sure you want to delete this appointment?'
      ))
    ) {
      return;
    }

    try {
      await this.db.deleteAppointment(id);
      await this.loadAppointments();
      void this.notify.success('Appointment deleted.');
    } catch {
      void this.notify.error('Unable to delete appointment.');
    }
  }
}
