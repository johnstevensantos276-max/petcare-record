import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar
} from '@ionic/angular';

import {
  DatabaseService,
  HistoryAction,
  HistoryEntry
} from '../services/database.service';

interface HistoryGroup {
  label: string;
  items: HistoryEntry[];
}

type HistoryFilter = 'all' | 'pets' | 'appointments' | 'login';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar
  ]
})
export class HistoryPage {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  history: HistoryEntry[] = [];
  filter: HistoryFilter = 'all';

  filters: { value: HistoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pets', label: 'Pets' },
    { value: 'appointments', label: 'Appointments' },
    { value: 'login', label: 'Login & Logout' }
  ];

  private icons: Record<HistoryAction, string> = {
    'login': 'log-in-outline',
    'logout': 'log-out-outline',
    'profile-updated': 'person-outline',
    'password-changed': 'lock-closed-outline',
    'pin-changed': 'keypad-outline',
    'password-reset': 'key-outline',
    'pet-added': 'paw-outline',
    'pet-updated': 'create-outline',
    'pet-deleted': 'trash-outline',
    'pet-passed-away': 'heart-outline',
    'pet-restored': 'paw-outline',
    'appointment-added': 'calendar-outline',
    'appointment-completed': 'checkmark-circle-outline',
    'appointment-missed': 'alert-circle-outline',
    'appointment-deleted': 'close-circle-outline',
    'appointment-rescheduled': 'calendar-outline'
  };

  constructor(
    private db: DatabaseService,
    private alertController: AlertController
  ) {}

  ionViewWillEnter(): void {
    void this.loadHistory();
  }

  async loadHistory(): Promise<void> {
    try {
      this.history = await this.db.getHistory();
    } catch (error) {
      console.error('Error loading history:', error);
      this.history = [];
    }

    this.cdr.markForCheck();
  }

  setFilter(filter: HistoryFilter): void {
    this.filter = filter;
  }

  get groups(): HistoryGroup[] {
    const groups: HistoryGroup[] = [];

    for (const item of this.history.filter(entry => this.matches(entry))) {
      const label = this.dayLabel(item.createdAt);
      const last = groups[groups.length - 1];

      if (last && last.label === label) {
        last.items.push(item);
      } else {
        groups.push({ label, items: [item] });
      }
    }

    return groups;
  }

  icon(item: HistoryEntry): string {
    return this.icons[item.action] ?? 'ellipse-outline';
  }

  isRemoval(item: HistoryEntry): boolean {
    return item.action.endsWith('-deleted');
  }

  time(item: HistoryEntry): string {
    return new Date(item.createdAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  async clearHistory(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Clear History',
      message: 'Delete all history? This cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: async () => {
            await this.db.clearHistory();
            await this.loadHistory();
          }
        }
      ]
    });

    await alert.present();
  }

  private matches(item: HistoryEntry): boolean {
    switch (this.filter) {
      case 'pets':
        return item.action.startsWith('pet-');
      case 'appointments':
        return item.action.startsWith('appointment-');
      case 'login':
        return (
          item.action === 'login' ||
          item.action === 'logout' ||
          item.action === 'password-reset'
        );
      default:
        return true;
    }
  }

  private dayLabel(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString([], {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }
}
