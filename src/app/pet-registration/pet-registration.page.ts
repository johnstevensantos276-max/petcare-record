
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonIcon
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  addOutline,
  arrowBackOutline,
  cameraOutline,
  cameraReverseOutline,
  imageOutline,
  saveOutline,
  trashOutline
} from 'ionicons/icons';

import {
  DatabaseService,
  PET_TYPES,
  VaccineRecord,
  localDate
} from '../services/database.service';
import { NotifyService } from '../services/notify.service';

@Component({
  selector: 'app-pet-registration',
  templateUrl: './pet-registration.page.html',
  styleUrls: ['./pet-registration.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonIcon
  ]
})
export class PetRegistrationPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  today = localDate();

  // Set when opened as /pet-registration?id=<petId> to edit an existing record.
  editingId: number | null = null;

  petName = '';
  petType = '';
  otherPetType = '';
  breed = '';
  birthday = '';
  ownerName = '';
  vaccinationStatus = '';
  vaccines: VaccineRecord[] = [];
  photo = '';

  cameraOpen = false;
  private cameraStream: MediaStream | null = null;
  private facingMode: 'environment' | 'user' = 'environment';

  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('captureInput') captureInput?: ElementRef<HTMLInputElement>;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private db: DatabaseService,
    private notify: NotifyService
  ) {
    addIcons({
      addOutline,
      arrowBackOutline,
      cameraOutline,
      cameraReverseOutline,
      imageOutline,
      saveOutline,
      trashOutline
    });
  }

  async ionViewWillEnter(): Promise<void> {
    this.resetForm();
    this.today = localDate();

    const id = Number(this.route.snapshot.queryParamMap.get('id')) || 0;
    this.editingId = null;

    if (!id) {
      this.cdr.markForCheck();
      return;
    }

    const pet = await this.db.getPet(id).catch(() => null);

    if (!pet) {
      void this.notify.error('Pet record not found.');
      void this.router.navigateByUrl('/pet-cards');
      return;
    }

    this.editingId = id;
    this.petName = pet.petName;

    if (PET_TYPES.includes(pet.petType)) {
      this.petType = pet.petType;
    } else {
      this.petType = 'Other';
      this.otherPetType = pet.petType === 'Other' ? '' : pet.petType;
    }

    this.breed = pet.breed;
    this.birthday = pet.birthday;
    this.ownerName = pet.ownerName;
    this.vaccinationStatus = pet.vaccinationStatus;
    this.vaccines = (pet.vaccines ?? []).map(vaccine => ({ ...vaccine }));
    this.photo = pet.photo ?? '';
    this.onVaccinationStatusChange();

    this.cdr.markForCheck();
  }

  ionViewWillLeave(): void {
    this.closeCamera();
  }

  // ---------- Photo ----------

  async openCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      // No live preview available (e.g. plain http): use the device camera app.
      this.captureInput?.nativeElement.click();
      return;
    }

    try {
      this.stopStream();
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode },
        audio: false
      });

      this.cameraOpen = true;
      this.cdr.detectChanges();

      const video = this.cameraVideo?.nativeElement;

      if (video) {
        video.srcObject = this.cameraStream;
        await video.play().catch(() => undefined);
      }
    } catch (error) {
      console.error('Unable to open camera:', error);
      this.closeCamera();
      void this.notify.error('Camera not available. Choose a photo instead.');
      this.captureInput?.nativeElement.click();
    }
  }

  async switchCamera(): Promise<void> {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this.openCamera();
  }

  capturePhoto(): void {
    const video = this.cameraVideo?.nativeElement;

    if (!video || !video.videoWidth) {
      return;
    }

    this.photo = this.resize(video, video.videoWidth, video.videoHeight);
    this.closeCamera();
  }

  closeCamera(): void {
    this.stopStream();
    this.cameraOpen = false;
    this.cdr.markForCheck();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file || !file.type.startsWith('image/')) {
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      this.photo = this.resize(image, image.naturalWidth, image.naturalHeight);
      URL.revokeObjectURL(url);
      this.cdr.markForCheck();
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      void this.notify.error('Unable to read that photo.');
    };

    image.src = url;
  }

  // Keep stored photos small: longest side 600px, JPEG.
  private resize(source: CanvasImageSource, width: number, height: number): string {
    const scale = Math.min(1, 600 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.8);
  }

  private stopStream(): void {
    this.cameraStream?.getTracks().forEach(track => track.stop());
    this.cameraStream = null;
  }

  onVaccinationStatusChange(): void {
    if (this.vaccinationStatus === 'Vaccinated' && this.vaccines.length === 0) {
      this.addVaccine();
    }
  }

  addVaccine(): void {
    this.vaccines.push({ name: '', purpose: '', date: '' });
  }

  removeVaccine(index: number): void {
    this.vaccines.splice(index, 1);
  }

  async savePet(): Promise<void> {
    if (
      !this.petName.trim() ||
      !this.petType ||
      !this.birthday ||
      !this.ownerName.trim() ||
      !this.vaccinationStatus
    ) {
      void this.notify.error('Please complete all required fields.');
      return;
    }

    const petType = this.petType === 'Other'
      ? this.otherPetType.trim()
      : this.petType;

    if (!petType) {
      void this.notify.error('Please specify what type of pet it is.');
      return;
    }

    if (this.birthday > this.today) {
      void this.notify.error('The birthday cannot be in the future.');
      return;
    }

    const vaccines = this.vaccinationStatus === 'Vaccinated'
      ? this.vaccines
        .map(vaccine => ({
          name: vaccine.name.trim(),
          purpose: vaccine.purpose.trim(),
          date: vaccine.date.slice(0, 10)
        }))
        .filter(vaccine => vaccine.name || vaccine.purpose || vaccine.date)
      : [];

    if (this.vaccinationStatus === 'Vaccinated') {
      if (vaccines.length === 0) {
        void this.notify.error('Please add at least one vaccine.');
        return;
      }

      if (vaccines.some(vaccine => !vaccine.name || !vaccine.date)) {
        void this.notify.error('Each vaccine needs a name and a date.');
        return;
      }

      if (vaccines.some(vaccine => vaccine.date > this.today)) {
        void this.notify.error('A vaccine date cannot be in the future.');
        return;
      }

      if (vaccines.some(vaccine => vaccine.date < this.birthday.slice(0, 10))) {
        void this.notify.error('A vaccine date cannot be before the pet\'s birthday.');
        return;
      }
    }

    const record = {
      petName: this.petName.trim(),
      petType,
      breed: this.breed.trim(),
      birthday: this.birthday.slice(0, 10),
      ownerName: this.ownerName.trim(),
      vaccinationStatus: this.vaccinationStatus,
      vaccines,
      photo: this.photo || undefined
    };

    try {
      if (this.editingId) {
        const id = this.editingId;
        await this.db.updatePet(id, record);
        void this.notify.success('Pet record updated successfully!');

        this.resetForm();
        void this.router.navigate(['/pet-details'], { queryParams: { id } });
        return;
      }

      await this.db.addPet(record);
      void this.notify.success('Pet record saved successfully!');

      this.resetForm();
      void this.router.navigateByUrl('/pet-cards');
    } catch (error) {
      console.error('Error saving pet record:', error);
      void this.notify.error('Unable to save the pet record. Please try again.');
    }
  }

  routerBack(): void {
    if (this.editingId) {
      void this.router.navigate(['/pet-details'], {
        queryParams: { id: this.editingId }
      });
      return;
    }

    void this.router.navigateByUrl('/dashboard');
  }

  private resetForm(): void {
    this.petName = '';
    this.petType = '';
    this.otherPetType = '';
    this.breed = '';
    this.birthday = '';
    this.ownerName = '';
    this.vaccinationStatus = '';
    this.vaccines = [];
    this.photo = '';
  }
}
