import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { AlertController, IonIcon } from '@ionic/angular';
import { filter } from 'rxjs/operators';

import {
  DatabaseService,
  appointmentStatus,
  isVaccinated
} from '../services/database.service';
import { SidebarService } from '../services/sidebar.service';
import { ThemeService } from '../services/theme.service';

interface MenuItem {
  label: string;
  icon: string;
  path: string;
  queryParams?: Record<string, string>;
  badge?: () => number;
  badgeDanger?: boolean;
  badgeSuccess?: boolean;
}

const HIDDEN_ON = ['/login', '/register', '/forgot-password'];

// Pages that already have their own button for opening the sidebar.
const OWN_TOGGLE_ON = ['/dashboard'];

// From this width up the sidebar stays open beside the page.
const DESKTOP_QUERY = '(min-width: 992px)';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon]
})
export class SidebarComponent {
  // The app is zoneless: refresh the view after async database calls.
  private cdr = inject(ChangeDetectorRef);

  open = false;
  visible = false;
  showToggle = false;
  isDesktop = false;
  currentPath = '';

  userName = 'User';
  userUsername = '';
  petCount = 0;
  pendingCount = 0;
  completedCount = 0;
  missedCount = 0;
  notVaccinatedCount = 0;

  mainItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'home-outline', path: '/dashboard' },
    { label: 'Calendar', icon: 'calendar-number-outline', path: '/calendar' },
    { label: 'Reports', icon: 'bar-chart-outline', path: '/reports' },
    { label: 'History', icon: 'time-outline', path: '/history' },
    { label: 'Memories', icon: 'heart-outline', path: '/memories' }
  ];

  // Shortcuts to the Appointments page, already filtered.
  appointmentItems: MenuItem[] = [
    {
      label: 'Pending',
      icon: 'hourglass-outline',
      path: '/appointments',
      queryParams: { status: 'Pending' },
      badge: () => this.pendingCount
    },
    {
      label: 'Completed',
      icon: 'checkmark-circle-outline',
      path: '/appointments',
      queryParams: { status: 'Completed' },
      badge: () => this.completedCount,
      badgeSuccess: true
    }
  ];

  shortcutItems: MenuItem[] = [
    {
      label: 'Missed Appointments',
      icon: 'alert-circle-outline',
      path: '/appointments',
      queryParams: { status: 'Missed' },
      badge: () => this.missedCount,
      badgeDanger: true
    },
    {
      label: 'Not Vaccinated Pets',
      icon: 'medkit-outline',
      path: '/pet-cards',
      queryParams: { vaccination: 'Not Vaccinated' },
      badge: () => this.notVaccinatedCount,
      badgeDanger: true
    }
  ];

  constructor(
    private router: Router,
    private db: DatabaseService,
    private alertController: AlertController,
    private sidebar: SidebarService,
    readonly theme: ThemeService
  ) {
    sidebar.toggleRequests.subscribe(() => void this.toggle());

    // Appointments turn into missed ones as time passes, so recheck the red
    // badges every minute (not only when the menu is opened).
    setInterval(() => {
      if (this.visible) {
        void this.loadSummary();
      }
    }, 60 * 1000);

    const desktop = window.matchMedia(DESKTOP_QUERY);
    this.isDesktop = desktop.matches;
    desktop.addEventListener('change', event => {
      this.isDesktop = event.matches;
      this.updateLayout();
    });

    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.currentPath = this.router.url.split('?')[0];
        this.visible =
          !!this.db.currentUserId && !HIDDEN_ON.includes(this.currentPath);
        this.showToggle =
          this.visible && !OWN_TOGGLE_ON.includes(this.currentPath);
        this.open = false;
        this.updateLayout();
      });
  }

  // On desktop the sidebar is always shown; let global.scss move the page
  // over to make room for it. The counts are refreshed on every page so the
  // red dot on the menu button stays correct on phones too.
  private updateLayout(): void {
    const docked = this.visible && this.isDesktop;
    document.body.classList.toggle('has-sidebar', docked);

    if (this.visible) {
      void this.loadSummary();
    } else {
      this.sidebar.needsAttention.next(false);
    }

    this.cdr.markForCheck();
  }

  // Something in the menu has a red badge.
  get needsAttention(): boolean {
    return this.missedCount > 0 || this.notVaccinatedCount > 0;
  }

  get userInitial(): string {
    return this.userName.trim().charAt(0).toUpperCase() || '?';
  }

  async toggle(): Promise<void> {
    this.open = !this.open;
    this.cdr.markForCheck();

    if (this.open) {
      await this.loadSummary();
    }
  }

  close(): void {
    this.open = false;
    this.cdr.markForCheck();
  }

  isActive(item: MenuItem): boolean {
    return !item.queryParams && this.currentPath === item.path;
  }

  // e.g. "Pending" is highlighted while /appointments?status=Pending is open.
  isActiveFilter(item: MenuItem): boolean {
    const status = item.queryParams?.['status'];
    return (
      this.currentPath === item.path &&
      !!status &&
      new URLSearchParams(this.router.url.split('?')[1] ?? '').get('status') === status
    );
  }

  openSettings(): void {
    this.close();
    void this.router.navigate(['/settings']);
  }

  go(item: MenuItem): void {
    this.close();
    void this.router.navigate([item.path], { queryParams: item.queryParams });
  }

  async logout(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Logout',
          role: 'destructive',
          handler: () => {
            this.close();
            this.db.logout();
            void this.router.navigateByUrl('/login', { replaceUrl: true });
          }
        }
      ]
    });

    await alert.present();
  }

  private async loadSummary(): Promise<void> {
    try {
      const [user, pets, appointments] = await Promise.all([
        this.db.getCurrentUser(),
        this.db.getPets(),
        this.db.getAppointments()
      ]);

      const now = new Date();

      this.userName = user?.fullName || 'User';
      this.userUsername = user?.username || '';
      this.petCount = pets.length;
      this.notVaccinatedCount = pets.filter(pet => !isVaccinated(pet)).length;
      this.pendingCount = appointments.filter(item =>
        appointmentStatus(item, now) === 'Pending'
      ).length;
      this.completedCount = appointments.filter(item =>
        appointmentStatus(item, now) === 'Completed'
      ).length;
      this.missedCount = appointments.filter(item =>
        appointmentStatus(item, now) === 'Missed'
      ).length;
    } catch (error) {
      console.error('Unable to load sidebar summary:', error);
    }

    this.sidebar.needsAttention.next(this.visible && this.needsAttention);
    this.cdr.markForCheck();
  }
}
