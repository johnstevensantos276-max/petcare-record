import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
IonHeader,
IonToolbar,
IonTitle,
IonItem,
IonContent,
IonInput,
IonCard,
IonCardHeader,
IonCardTitle,
IonCardContent,
IonButton
} from '@ionic/angular';

@Component({
selector: 'app-home',
templateUrl: 'home.page.html',
styleUrls: ['home.page.scss'],
standalone: true,
imports: [
RouterLink,
IonHeader,
IonToolbar,
IonTitle,
IonItem,
IonContent,
IonInput,
IonCard,
IonCardHeader,
IonCardTitle,
IonCardContent,
IonButton
]
})
export class HomePage {}