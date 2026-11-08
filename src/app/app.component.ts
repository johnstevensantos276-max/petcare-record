import { Component } from '@angular/core';
import { IonApp } from '@ionic/angular/ion-app';
import { IonRouterOutlet } from '@ionic/angular/ion-router-outlet';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  addOutline,
  alertCircle,
  alertCircleOutline,
  arrowBackOutline,
  barChartOutline,
  calendar,
  calendarNumberOutline,
  calendarOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  chevronBackOutline,
  chevronForwardOutline,
  clipboardOutline,
  closeCircle,
  closeCircleOutline,
  closeOutline,
  createOutline,
  documentTextOutline,
  ellipseOutline,
  eyeOffOutline,
  eyeOutline,
  expandOutline,
  fileTrayOutline,
  gift,
  giftOutline,
  heart,
  heartOutline,
  homeOutline,
  hourglassOutline,
  keyOutline,
  keypadOutline,
  lockClosedOutline,
  logInOutline,
  logoFacebook,
  logoGoogle,
  logOutOutline,
  mailOutline,
  medkitOutline,
  menuOutline,
  moon,
  moonOutline,
  notificationsOutline,
  paw,
  settingsOutline,
  pawOutline,
  personOutline,
  shieldCheckmarkOutline,
  timeOutline,
  trashOutline
} from 'ionicons/icons';

import { ReminderService } from './services/reminder.service';
import { ThemeService } from './services/theme.service';
import { BottomNavComponent } from './bottom-nav/bottom-nav.component';
import { SidebarComponent } from './sidebar/sidebar.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  imports: [
    IonApp,
    IonRouterOutlet,
    BottomNavComponent,
    SidebarComponent
  ]
})
export class AppComponent {
  // ThemeService is created here so the saved light/dark choice is applied.
  constructor(reminders: ReminderService, theme: ThemeService) {
    // Register the shared icon set once so every page can use <ion-icon>.
    addIcons({
      addCircleOutline,
      addOutline,
      alertCircle,
      alertCircleOutline,
      arrowBackOutline,
      barChartOutline,
      calendar,
      calendarNumberOutline,
      calendarOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      chevronBackOutline,
      chevronForwardOutline,
      clipboardOutline,
      closeCircle,
      closeCircleOutline,
      closeOutline,
      createOutline,
      documentTextOutline,
      ellipseOutline,
      eyeOffOutline,
      eyeOutline,
      expandOutline,
      fileTrayOutline,
      gift,
      giftOutline,
      heart,
      heartOutline,
      homeOutline,
      hourglassOutline,
      keyOutline,
      keypadOutline,
      lockClosedOutline,
      logInOutline,
      logoFacebook,
      logoGoogle,
      logOutOutline,
      mailOutline,
      medkitOutline,
      menuOutline,
      moon,
      moonOutline,
      notificationsOutline,
      paw,
      settingsOutline,
      pawOutline,
      personOutline,
      shieldCheckmarkOutline,
      timeOutline,
      trashOutline
    });
    reminders.start();

    // Keep the logo splash (index.html) up briefly, then fade it out.
    setTimeout(() => {
      const splash = document.getElementById('splash');
      splash?.classList.add('hide');
      setTimeout(() => splash?.remove(), 500);
    }, 1600);
  }
}
