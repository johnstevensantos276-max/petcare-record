import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular';

import { PetRecord, birthdayAge, localDate } from '../services/database.service';

const SHOWN_KEY = 'petcareBirthdayShown';

interface BirthdayPet {
  pet: PetRecord;
  age: number;
}

// "Happy Birthday" pop-up with confetti, shown once a day when one of the
// user's pets has a birthday today.
@Component({
  selector: 'app-birthday-greeting',
  templateUrl: './birthday-greeting.component.html',
  styleUrls: ['./birthday-greeting.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon]
})
export class BirthdayGreetingComponent implements OnChanges, AfterViewInit, OnDestroy {
  // The app is zoneless: refresh the view when the pop-up opens or closes.
  private cdr = inject(ChangeDetectorRef);

  @Input() pets: PetRecord[] = [];

  @ViewChild('layer') layer?: ElementRef<HTMLElement>;

  celebrating: BirthdayPet[] = [];
  open = false;

  // Pieces of confetti: position, color and timing.
  readonly confetti = Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 12) * 0.18,
    duration: 2.6 + (i % 5) * 0.35,
    color: ['#4f8fa8', '#8cc7d6', '#f3b63f', '#e8707a', '#9fd3e6', '#c76b8f'][i % 6],
    round: i % 3 === 0
  }));

  ngOnChanges(): void {
    const today = localDate();
    this.celebrating = this.pets
      .map(pet => ({ pet, age: birthdayAge(pet) }))
      .filter((item): item is BirthdayPet => item.age !== null);

    // Show once per day for these pets.
    const key = `${today}:${this.celebrating.map(item => item.pet.id).join(',')}`;

    if (this.celebrating.length && this.readShown() !== key) {
      this.saveShown(key);
      this.openWhenFree();
    }

    this.cdr.markForCheck();
  }

  // If a pet's "In Loving Memory" card is showing (same day), confetti would
  // be out of place: wait until that card is closed, then celebrate.
  private openWhenFree(): void {
    setTimeout(() => {
      if (document.querySelector('.memorial-backdrop')) {
        this.openWhenFree();
        return;
      }

      this.open = true;
      this.cdr.markForCheck();
    }, 400);
  }

  // The page sits under the side menu and the bottom tabs, so the pop-up is
  // moved to <body> to cover the whole screen.
  ngAfterViewInit(): void {
    if (this.layer) {
      document.body.appendChild(this.layer.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.layer?.nativeElement.remove();
  }

  close(): void {
    this.open = false;
    this.cdr.markForCheck();
  }

  get names(): string {
    const names = this.celebrating.map(item => item.pet.petName);
    return names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0] ?? '';
  }

  ageText(item: BirthdayPet): string {
    return item.age === 0
      ? `${item.pet.petName} was born today!`
      : `${item.pet.petName} turns ${item.age} year${item.age === 1 ? '' : 's'} old today!`;
  }

  private readShown(): string {
    try {
      return localStorage.getItem(SHOWN_KEY) ?? '';
    } catch {
      return '';
    }
  }

  private saveShown(key: string): void {
    try {
      localStorage.setItem(SHOWN_KEY, key);
    } catch {
      // Private mode: it may show again, which is fine.
    }
  }
}
