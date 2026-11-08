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
  DatabaseService,
  PetRecord,
  isVaccinated
} from '../services/database.service';

// Pets that passed away, with all of their records kept.
@Component({
  selector: 'app-memories',
  templateUrl: './memories.page.html',
  styleUrls: ['./memories.page.scss'],
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
export class MemoriesPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  pets: PetRecord[] = [];
  loaded = false;

  constructor(
    private db: DatabaseService,
    private router: Router
  ) {}

  async ionViewWillEnter(): Promise<void> {
    try {
      this.pets = await this.db.getMemorialPets();
    } catch (error) {
      console.error('Unable to load memories:', error);
      this.pets = [];
    }

    this.loaded = true;
    this.cdr.markForCheck();
  }

  open(pet: PetRecord): void {
    void this.router.navigate(['/pet-details'], { queryParams: { id: pet.id } });
  }

  isVaccinated(pet: PetRecord): boolean {
    return isVaccinated(pet);
  }

  // "2019 – 2026" style years, or just the year they passed away.
  years(pet: PetRecord): string {
    const born = pet.birthday?.slice(0, 4);
    const passed = pet.passedAwayOn?.slice(0, 4);
    return born ? `${born} – ${passed}` : `Passed away ${passed}`;
  }

  // Exact time from the birthday to the day they passed away, e.g.
  // "8 years, 7 months", "3 months, 12 days" or "20 days".
  lifespan(pet: PetRecord): string {
    if (!pet.birthday || !pet.passedAwayOn) {
      return '';
    }

    const born = new Date(`${pet.birthday.slice(0, 10)}T00:00:00`);
    const passed = new Date(`${pet.passedAwayOn.slice(0, 10)}T00:00:00`);

    if (Number.isNaN(born.getTime()) || Number.isNaN(passed.getTime()) || passed < born) {
      return '';
    }

    // Whole months lived first...
    let totalMonths =
      (passed.getFullYear() - born.getFullYear()) * 12 +
      passed.getMonth() - born.getMonth();

    if (passed.getDate() < born.getDate()) {
      totalMonths--;
    }

    // ...then the days after the last "monthly birthday" (Jan 31 + 1 month
    // is Feb 28/29, so short months never give negative days).
    const lastMonthDay = (year: number, month: number) =>
      new Date(year, month + 1, 0).getDate();
    const anchorYear = born.getFullYear() + Math.floor((born.getMonth() + totalMonths) / 12);
    const anchorMonth = (born.getMonth() + totalMonths) % 12;
    const anchor = new Date(
      anchorYear,
      anchorMonth,
      Math.min(born.getDate(), lastMonthDay(anchorYear, anchorMonth))
    );

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    const days = Math.round((passed.getTime() - anchor.getTime()) / 86400000);

    const part = (count: number, unit: string) =>
      `${count} ${unit}${count === 1 ? '' : 's'}`;
    const parts: string[] = [];

    if (years) {
      parts.push(part(years, 'year'));
    }

    if (months) {
      parts.push(part(months, 'month'));
    }

    // Days only matter for pets younger than a year.
    if (!years && days) {
      parts.push(part(days, 'day'));
    }

    return parts.length ? parts.join(', ') : 'Less than a day';
  }

  trackByPet(index: number, pet: PetRecord): number | string {
    return pet.id ?? index;
  }
}
