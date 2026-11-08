
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import {
  AlertController,
  IonContent,
  IonHeader,
  IonIcon,
  IonToolbar,
  IonTitle,
  IonButton,
  IonCard,
  IonCardContent
} from '@ionic/angular';

import {
  DatabaseService,
  PetRecord,
  VaccineRecord,
  localDate
} from '../services/database.service';
import { NotifyService } from '../services/notify.service';

@Component({
  selector: 'app-pet-details',
  templateUrl: './pet-details.page.html',
  styleUrls: ['./pet-details.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonIcon,
    IonToolbar,
    IonTitle,
    IonButton,
    IonCard,
    IonCardContent
  ]
})
export class PetDetailsPage implements OnInit, AfterViewInit, OnDestroy {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  pet: PetRecord | null = null;
  petId = 0;
  // Full-screen view of the pet's photo.
  photoOpen = false;

  @ViewChild('photoLayer') photoLayer?: ElementRef<HTMLElement>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private db: DatabaseService,
    private notify: NotifyService,
    private alertController: AlertController
  ) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.petId = Number(params.get('id')) || 0;
      void this.loadPet();
    });
  }

  async loadPet() {
    try {
      this.pet = this.petId ? await this.db.getPet(this.petId) : null;
    } catch {
      this.pet = null;
    }

    this.cdr.markForCheck();
  }

  // The page sits under the side menu and the bottom tabs, so the photo
  // viewer is moved to <body> to cover the whole screen.
  ngAfterViewInit() {
    if (this.photoLayer) {
      document.body.appendChild(this.photoLayer.nativeElement);
    }
  }

  ngOnDestroy() {
    this.photoLayer?.nativeElement.remove();
  }

  openPhoto() {
    this.photoOpen = true;
  }

  @HostListener('document:keydown.escape')
  closePhoto() {
    this.photoOpen = false;
  }

  ionViewWillLeave() {
    this.photoOpen = false;
  }

  editRecord() {
    this.router.navigate(['/pet-registration'], {
      queryParams: { id: this.petId }
    });
  }

  goBack() {
    this.router.navigate([this.pet?.passedAwayOn ? '/memories' : '/pet-cards']);
  }

  // Moves the pet to Memories after asking for the date.
  async markPassedAway() {
    if (!this.pet) {
      return;
    }

    const today = localDate();
    const alert = await this.alertController.create({
      header: 'Mark as Passed Away',
      message:
        `We're sorry for your loss. ${this.getPetName()} will be moved to Memories ` +
        'with all of their records. Upcoming appointments will be cancelled.\n\n' +
        `Date ${this.getPetName()} passed away:`,
      cssClass: 'passed-away-alert',
      inputs: [
        {
          name: 'date',
          type: 'date',
          // Left empty so the real date is picked, not today by mistake.
          max: today,
          min: this.pet.birthday?.slice(0, 10) || undefined
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Move to Memories', role: 'confirm' }
      ]
    });

    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    const date = String(data?.values?.date || '');

    if (role !== 'confirm') {
      return;
    }

    if (!date || date > today) {
      void this.notify.error('Please choose the date they passed away (today or earlier).');
      return;
    }

    try {
      const cancelled = await this.db.markPassedAway(this.petId, date);
      void this.notify.success(
        cancelled
          ? `${this.getPetName()} was moved to Memories. ${cancelled} upcoming appointment${cancelled === 1 ? ' was' : 's were'} cancelled.`
          : `${this.getPetName()} was moved to Memories.`
      );
      this.router.navigate(['/memories']);
    } catch (error) {
      void this.notify.error(error instanceof Error ? error.message : 'Unable to update the record.');
    }
  }

  async restorePet() {
    if (
      !this.pet ||
      !(await this.notify.confirm(
        'Restore Pet',
        `Move ${this.getPetName()} back to My Pets?`,
        'Restore'
      ))
    ) {
      return;
    }

    try {
      await this.db.restorePet(this.petId);
      void this.notify.success(`${this.getPetName()} is back in My Pets.`);
      this.router.navigate(['/pet-cards']);
    } catch (error) {
      void this.notify.error(error instanceof Error ? error.message : 'Unable to update the record.');
    }
  }

  async deleteRecord() {
    if (
      !this.pet ||
      !(await this.notify.confirm(
        'Delete Pet Record',
        'Are you sure you want to delete this pet record? Its appointments will also be removed.'
      ))
    ) {
      return;
    }

    try {
      await this.db.deletePet(this.petId);
      void this.notify.success('Pet record deleted.');
      this.router.navigate(['/pet-cards']);
    } catch (error) {
      console.error('Unable to delete pet record:', error);
      void this.notify.error('Unable to delete the pet record.');
    }
  }

  getPetName() {
    return this.pet?.petName || 'Pet';
  }

  getPetType() {
    return this.pet?.petType || 'Not specified';
  }

  getPetBreed() {
    return this.pet?.breed || 'Not specified';
  }

  getPetBirthday() {
    return this.pet?.birthday || 'Not specified';
  }

  getOwnerName() {
    return this.pet?.ownerName || 'Not specified';
  }

  getVaccines(): VaccineRecord[] {
    return this.pet?.vaccines ?? [];
  }

  getVaccinationStatus() {
    return this.pet?.vaccinationStatus || 'Not specified';
  }
}
