
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import {
  DatabaseService,
  PetRecord,
  birthdayAge,
  isVaccinated,
  memorialYears
} from '../services/database.service';
import { BirthdayGreetingComponent } from '../birthday-greeting/birthday-greeting.component';
import { MemorialGreetingComponent } from '../memorial-greeting/memorial-greeting.component';
import { SidebarService } from '../services/sidebar.service';

type Pet = PetRecord;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    BirthdayGreetingComponent,
    MemorialGreetingComponent
  ]
})
export class DashboardPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  pets: Pet[] = [];
  // Pets in Memories, for the yearly "In Loving Memory" reminder.
  memorialPets: Pet[] = [];
  userName = 'User';

  constructor(
    private router: Router,
    private db: DatabaseService,
    private sidebar: SidebarService
  ) {}

  ionViewWillEnter(): void {
    void this.loadPets();
  }

  async loadPets(): Promise<void> {
    try {
      const user = await this.db.getCurrentUser();
      this.userName = user?.fullName || 'User';
      [this.pets, this.memorialPets] = await Promise.all([
        this.db.getPets(),
        this.db.getMemorialPets()
      ]);
    } catch (error) {
      console.error('Error loading pets:', error);
      this.pets = [];
    }

    this.cdr.markForCheck();
  }

  // Pets whose birthday is today, with the age they turn.
  get birthdays(): { pet: Pet; age: number }[] {
    return this.pets
      .map(pet => ({ pet, age: birthdayAge(pet) }))
      .filter((item): item is { pet: Pet; age: number } => item.age !== null);
  }

  // Pets that passed away on this day in an earlier year.
  get memorials(): { pet: Pet; years: number }[] {
    return this.memorialPets
      .map(pet => ({ pet, years: memorialYears(pet) }))
      .filter((item): item is { pet: Pet; years: number } => item.years !== null);
  }

  // Red dot on the menu button when the sidebar has a red badge.
  get needsAttention$() {
    return this.sidebar.needsAttention;
  }

  openSidebar(): void {
    this.sidebar.toggle();
  }

  get totalPets(): number {
    return this.pets.length;
  }

  isVaccinated(pet: Pet): boolean {
    return isVaccinated(pet);
  }

  get vaccinatedCount(): number {
    return this.pets.filter(pet => this.isVaccinated(pet)).length;
  }

  get notVaccinatedCount(): number {
    return this.pets.filter(pet => !this.isVaccinated(pet)).length;
  }

  // Names used by the dashboard HTML
  get vaccinatedPets(): number {
    return this.vaccinatedCount;
  }

  get notVaccinatedPets(): number {
    return this.notVaccinatedCount;
  }

  petName(pet: Pet): string {
    return pet.petName || 'Unnamed Pet';
  }

  petType(pet: Pet): string {
    return pet.petType || 'Pet';
  }

  petAge(pet: Pet): string {
    if (pet.birthday) {
      const birth = new Date(`${pet.birthday.slice(0, 10)}T00:00:00`);

      if (!Number.isNaN(birth.getTime())) {
        const today = new Date();
        let years = today.getFullYear() - birth.getFullYear();

        if (
          today.getMonth() < birth.getMonth() ||
          (
            today.getMonth() === birth.getMonth() &&
            today.getDate() < birth.getDate()
          )
        ) {
          years--;
        }

        return years <= 0
          ? 'Under 1 year old'
          : `${years} ${years === 1 ? 'year' : 'years'} old`;
      }
    }

    return 'Age not set';
  }

  goTo(path: string): void {
    this.router.navigateByUrl(path);
  }

  openPet(pet: Pet): void {
    void this.router.navigate(['/pet-details'], {
      queryParams: { id: pet.id }
    });
  }

  trackByPet(index: number, pet: Pet): number | string {
    return pet.id ?? `${this.petName(pet)}-${index}`;
  }
}
