import { Injectable } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular';

// In-app replacements for window.alert() / window.confirm(). Native dialogs
// are blocked inside sandboxed previews (like the VS Code Mobile Preview),
// which made buttons look like they did nothing.
@Injectable({ providedIn: 'root' })
export class NotifyService {
  constructor(
    private toastController: ToastController,
    private alertController: AlertController
  ) {}

  success(message: string): Promise<void> {
    return this.show(message, 'success', 'checkmark-circle');
  }

  error(message: string): Promise<void> {
    return this.show(message, 'danger', 'alert-circle');
  }

  async confirm(
    header: string,
    message: string,
    confirmText = 'Delete'
  ): Promise<boolean> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: confirmText, role: 'confirm', cssClass: 'alert-danger-button' }
      ]
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  private async show(
    message: string,
    color: 'success' | 'danger',
    icon: string
  ): Promise<void> {
    const toast = await this.toastController.create({
      message,
      icon,
      color,
      duration: 2200,
      position: 'top',
      cssClass: 'pc-toast'
    });

    await toast.present();
  }
}
