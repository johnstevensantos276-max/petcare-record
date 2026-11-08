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

import { PetRecord, localDate, memorialYears } from '../services/database.service';

const SHOWN_KEY = 'petcareMemorialShown';

interface MemorialPet {
  pet: PetRecord;
  years: number;
}

// A gentle "In Loving Memory" card, shown once a day on the anniversary of
// the day a pet passed away. Soft falling hearts instead of confetti.
@Component({
  selector: 'app-memorial-greeting',
  templateUrl: './memorial-greeting.component.html',
  styleUrls: ['./memorial-greeting.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon]
})
export class MemorialGreetingComponent implements OnChanges, AfterViewInit, OnDestroy {
  // The app is zoneless: refresh the view when the card opens or closes.
  private cdr = inject(ChangeDetectorRef);

  // Pets that passed away (from Memories).
  @Input() pets: PetRecord[] = [];

  @ViewChild('layer') layer?: ElementRef<HTMLElement>;

  remembering: MemorialPet[] = [];
  open = false;

  // Slowly falling hearts: position, size and timing.
  readonly hearts = Array.from({ length: 18 }, (_, i) => ({
    left: (i * 53) % 100,
    delay: (i % 9) * 0.7,
    duration: 7 + (i % 4) * 1.5,
    size: 12 + (i % 3) * 5
  }));

  ngOnChanges(): void {
    const today = localDate();
    this.remembering = this.pets
      .map(pet => ({ pet, years: memorialYears(pet) }))
      .filter((item): item is MemorialPet => item.years !== null);

    // Show once per day for these pets.
    const key = `${today}:${this.remembering.map(item => item.pet.id).join(',')}`;

    if (this.remembering.length && this.readShown() !== key) {
      this.saveShown(key);
      this.open = true;
    }

    this.cdr.markForCheck();
  }

  // Moved to <body> so it covers the side menu and the bottom tabs too.
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
    const names = this.remembering.map(item => item.pet.petName);
    return names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0] ?? '';
  }

  yearsText(item: MemorialPet): string {
    return `${item.years} year${item.years === 1 ? '' : 's'} ago today, ` +
      `${item.pet.petName} crossed the rainbow bridge.`;
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
