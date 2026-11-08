import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

// Lets pages (like the Dashboard header button) open the app sidebar and
// show the red dot when something in it needs attention.
@Injectable({ providedIn: 'root' })
export class SidebarService {
  readonly toggleRequests = new Subject<void>();
  // True while the sidebar shows a red badge (missed appointments or pets
  // that are not vaccinated).
  readonly needsAttention = new BehaviorSubject<boolean>(false);

  toggle(): void {
    this.toggleRequests.next();
  }
}
