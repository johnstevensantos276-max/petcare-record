import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { filter } from 'rxjs/operators';

import { DatabaseService } from '../services/database.service';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  // Other pages that should also highlight this tab.
  alsoActiveOn?: string[];
}

const HIDDEN_ON = ['/login', '/register', '/forgot-password'];

// Lives in the app shell so the tabs stay visible on every page.
@Component({
  selector: 'app-bottom-nav',
  templateUrl: './bottom-nav.component.html',
  styleUrls: ['./bottom-nav.component.scss'],
  standalone: true,
  imports: [CommonModule, IonIcon]
})
export class BottomNavComponent {
  // The app is zoneless: refresh the view after router events.
  private cdr = inject(ChangeDetectorRef);

  visible = false;
  currentPath = '';

  items: NavItem[] = [
    { label: 'Home', icon: 'home-outline', path: '/dashboard' },
    { label: 'Add Pet', icon: 'add-circle-outline', path: '/pet-registration' },
    {
      label: 'Records',
      icon: 'document-text-outline',
      path: '/pet-cards',
      alsoActiveOn: ['/pet-details']
    },
    { label: 'Appointment', icon: 'calendar-outline', path: '/appointments' }
  ];

  constructor(
    private router: Router,
    private db: DatabaseService
  ) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.currentPath = this.router.url.split('?')[0];
        this.visible =
          !!this.db.currentUserId && !HIDDEN_ON.includes(this.currentPath);
        // Lets global.scss leave room for the tabs under each page.
        document.body.classList.toggle('has-bottom-nav', this.visible);
        this.cdr.markForCheck();
      });
  }

  isActive(item: NavItem): boolean {
    return (
      this.currentPath === item.path ||
      !!item.alsoActiveOn?.includes(this.currentPath)
    );
  }

  go(item: NavItem): void {
    void this.router.navigateByUrl(item.path);
  }
}
