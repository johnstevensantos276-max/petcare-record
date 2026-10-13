import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
IonHeader,
IonToolbar,
IonTitle,
IonContent,
IonCard,
IonCardHeader,
IonCardTitle,
IonCardContent,
IonButton,
IonIcon
} from '@ionic/angular';

@Component({
selector: 'app-dashboard',
templateUrl: './dashboard.page.html',
styleUrls: ['./dashboard.page.scss'],
standalone: true,
imports: [
RouterLink,
IonHeader,
IonToolbar,
IonTitle,
IonContent,
IonCard,
IonCardHeader,
IonCardTitle,
IonCardContent,
IonButton,
IonIcon
]
})
export class DashboardPage {}