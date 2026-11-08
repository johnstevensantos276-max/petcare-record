
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonBadge
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import { chevronForwardOutline } from 'ionicons/icons';

import {
  DatabaseService,
  PET_TYPES,
  PetRecord,
  VaccineRecord,
  isVaccinated
} from '../services/database.service';

@Component({
  selector: 'app-pet-cards',
  templateUrl: './pet-cards.page.html',
  styleUrls: ['./pet-cards.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonBadge
  ]
})
export class PetCardsPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  pets: PetRecord[] = [];

  selectedPetType = 'All';
  selectedVaccination = 'All';

  petTypes = ['All', ...PET_TYPES, 'Other'];

  vaccinationStatuses = [
    'All',
    'Vaccinated',
    'Not Vaccinated'
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private db: DatabaseService
  ) {
    addIcons({ chevronForwardOutline });

    // Sidebar shortcuts link here with ?vaccination=Not Vaccinated.
    this.route.queryParamMap.subscribe(params => {
      const vaccination = params.get('vaccination');

      if (vaccination && this.vaccinationStatuses.includes(vaccination)) {
        this.selectedVaccination = vaccination;
        this.selectedPetType = 'All';
        void this.loadPets();
      }
    });
  }

  ionViewWillEnter() {
    void this.loadPets();
  }

  async loadPets() {
    try {
      this.pets = await this.db.getPets();
    } catch (error) {
      console.error('Error loading pet records:', error);
      this.pets = [];
    }

    this.cdr.markForCheck();
  }

  get filteredPets(): PetRecord[] {
    const knownTypes = PET_TYPES.map(type => type.toLowerCase());
    const selectedType = this.selectedPetType.toLowerCase();

    return this.pets.filter(pet => {
      const type = pet.petType.toLowerCase();

      // "Other" covers any pet type the user specified themselves.
      const typeMatches =
        this.selectedPetType === 'All' ||
        (this.selectedPetType === 'Other'
          ? !knownTypes.includes(type)
          : type === selectedType);

      const vaccinationMatches =
        this.selectedVaccination === 'All' ||
        (this.selectedVaccination === 'Vaccinated') === this.isVaccinated(pet);

      return typeMatches && vaccinationMatches;
    });
  }

  isVaccinated(pet: PetRecord): boolean {
    return isVaccinated(pet);
  }

  getVaccines(pet: PetRecord): VaccineRecord[] {
    return pet.vaccines ?? [];
  }

  getPetName(pet: PetRecord): string {
    return pet.petName || 'Unnamed Pet';
  }

  getPetType(pet: PetRecord): string {
    return pet.petType || 'Not specified';
  }

  getPetBreed(pet: PetRecord): string {
    return pet.breed || 'Not specified';
  }

  getPetBirthday(pet: PetRecord): string {
    return pet.birthday || 'Not specified';
  }

  getOwnerName(pet: PetRecord): string {
    return pet.ownerName || 'Not specified';
  }

  openPet(pet: PetRecord) {
    this.router.navigate(['/pet-details'], {
      queryParams: { id: pet.id }
    });
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  resetFilters() {
    this.selectedPetType = 'All';
    this.selectedVaccination = 'All';
  }
}
