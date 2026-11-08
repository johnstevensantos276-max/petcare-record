import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar
} from '@ionic/angular';

import {
  Appointment,
  DatabaseService,
  PetRecord,
  appointmentStatus,
  localDate,
  toDateTime
} from '../services/database.service';

type EventKind = 'birthday' | 'memory' | 'appointment';

interface CalendarEvent {
  kind: EventKind;
  // Pet name shown inside the day box (births and deaths only).
  name?: string;
  title: string;
  detail: string;
  // Where tapping the event goes.
  link: { path: string; queryParams?: Record<string, string | number> };
}

interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number;
  inMonth: boolean;
  events: CalendarEvent[];
  named: CalendarEvent[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A month calendar with pet birthdays (every year), the days pets passed away
// (remembered every year) and pending appointments.
@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.page.html',
  styleUrls: ['./calendar.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar
  ]
})
export class CalendarPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  readonly weekdays = WEEKDAYS;
  readonly today = localDate();

  // First day of the month being shown.
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  selected = localDate();
  weeks: CalendarDay[][] = [];

  private pets: PetRecord[] = [];
  private memorialPets: PetRecord[] = [];
  private appointments: Appointment[] = [];

  constructor(
    private db: DatabaseService,
    private router: Router
  ) {}

  async ionViewWillEnter(): Promise<void> {
    try {
      const [pets, memorialPets, appointments] = await Promise.all([
        this.db.getPets(),
        this.db.getMemorialPets(),
        this.db.getAppointments()
      ]);
      this.pets = pets;
      this.memorialPets = memorialPets;
      // Only upcoming ones; completed and missed are not shown.
      this.appointments = appointments.filter(item => appointmentStatus(item) === 'Pending');
    } catch (error) {
      console.error('Unable to load the calendar:', error);
    }

    this.build();
  }

  get monthLabel(): string {
    return this.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  get selectedLabel(): string {
    return toDateTime(this.selected, '00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  get selectedEvents(): CalendarEvent[] {
    return this.eventsOn(this.selected);
  }

  // Everything in the shown month, for the list under the calendar.
  get monthEvents(): { date: string; label: string; events: CalendarEvent[] }[] {
    return this.weeks
      .flat()
      .filter(day => day.inMonth && day.events.length)
      .map(day => ({
        date: day.date,
        label: toDateTime(day.date, '00:00').toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        }),
        events: day.events
      }));
  }

  changeMonth(step: number): void {
    this.month = new Date(this.month.getFullYear(), this.month.getMonth() + step, 1);
    this.build();
  }

  goToday(): void {
    const now = new Date();
    this.month = new Date(now.getFullYear(), now.getMonth(), 1);
    this.selected = this.today;
    this.build();
  }

  select(day: CalendarDay): void {
    this.selected = day.date;

    // Tapping a grey day from the next/previous month moves to that month.
    if (!day.inMonth) {
      const date = toDateTime(day.date, '00:00');
      this.month = new Date(date.getFullYear(), date.getMonth(), 1);
      this.build();
    }
  }

  open(event: CalendarEvent): void {
    void this.router.navigate([event.link.path], { queryParams: event.link.queryParams });
  }

  hasKind(day: CalendarDay, kind: EventKind): boolean {
    return day.events.some(event => event.kind === kind);
  }

  ariaLabel(day: CalendarDay): string {
    return [day.date, ...day.events.map(event => event.title)].join(', ');
  }

  icon(kind: EventKind): string {
    return { birthday: 'gift-outline', memory: 'heart', appointment: 'calendar-outline' }[kind];
  }

  private build(): void {
    const year = this.month.getFullYear();
    const month = this.month.getMonth();
    // Start on the Sunday on or before the 1st, and show 6 full weeks.
    const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());

    this.weeks = [];

    for (let week = 0; week < 6; week++) {
      const days: CalendarDay[] = [];

      for (let i = 0; i < 7; i++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + i);
        const iso = localDate(date);
        const events = this.eventsOn(iso);
        days.push({
          date: iso,
          day: date.getDate(),
          inMonth: date.getMonth() === month,
          events,
          named: events.filter(event => event.name)
        });
      }

      this.weeks.push(days);
    }

    this.cdr.markForCheck();
  }

  private eventsOn(date: string): CalendarEvent[] {
    const [year, month, day] = date.split('-').map(Number);
    const events: CalendarEvent[] = [];

    // Pets that passed away keep their birthday on the calendar too.
    for (const pet of [...this.pets, ...this.memorialPets]) {
      const born = this.yearlyMatch(pet.birthday, year, month, day);

      if (born !== null && born <= year) {
        const age = year - born;
        const yearsText = `${age} year${age === 1 ? '' : 's'} old`;
        const afterPassing = !!pet.passedAwayOn && date > pet.passedAwayOn.slice(0, 10);
        events.push({
          kind: 'birthday',
          name: pet.petName,
          title: age === 0 ? `${pet.petName} was born` : `${pet.petName}'s birthday`,
          detail: age === 0
            ? 'Born on this day'
            : afterPassing ? `Would have turned ${yearsText}` : `Turns ${yearsText}`,
          link: { path: '/pet-details', queryParams: { id: pet.id! } }
        });
      }
    }

    for (const pet of this.memorialPets) {
      const passed = this.yearlyMatch(pet.passedAwayOn, year, month, day);

      if (passed !== null && passed <= year) {
        const years = year - passed;
        events.push({
          kind: 'memory',
          name: pet.petName,
          title: years === 0 ? `${pet.petName} passed away` : `Remembering ${pet.petName}`,
          detail: years === 0
            ? 'Forever in our hearts'
            : `${years} year${years === 1 ? '' : 's'} since they passed away`,
          link: { path: '/pet-details', queryParams: { id: pet.id! } }
        });
      }
    }

    for (const item of this.appointments) {
      if (item.date === date) {
        events.push({
          kind: 'appointment',
          title: item.purpose
            ? `${item.petName}: ${item.purpose}`
            : `${item.petName}'s appointment`,
          detail: `${item.doctorName} · ${toDateTime(item.date, item.time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          })}`,
          link: { path: '/appointments', queryParams: { status: 'Pending' } }
        });
      }
    }

    return events;
  }

  // For yearly events (birthdays, memorial days): the year of `value` when
  // it falls on this month/day, else null. Feb 29 is shown on Feb 28 in
  // years without a Feb 29.
  private yearlyMatch(value: string | undefined, year: number, month: number, day: number): number | null {
    const match = value?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const [, y, m, d] = match.map(Number);
    const leap = new Date(year, 1, 29).getMonth() === 1;
    const shownDay = m === 2 && d === 29 && !leap ? 28 : d;

    return m === month && shownDay === day ? y : null;
  }
}
