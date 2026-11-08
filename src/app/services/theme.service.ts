import { Injectable } from '@angular/core';

const THEME_KEY = 'petcareTheme';

// Light / dark mode. The choice is remembered on this device; index.html
// applies it before the app loads so the page does not flash light first.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private dark = this.readSaved();

  constructor() {
    this.apply();
  }

  get isDark(): boolean {
    return this.dark;
  }

  setDark(dark: boolean): void {
    this.dark = dark;
    this.apply();

    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  private apply(): void {
    // Ionic's dark palette and our own dark colors (theme/variables.scss)
    // both switch on this class.
    document.documentElement.classList.toggle('ion-palette-dark', this.dark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', this.dark ? '#1b4556' : '#4f8fa8');
  }

  private readSaved(): boolean {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  }
}
