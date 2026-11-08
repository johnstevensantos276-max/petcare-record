import { Injectable } from '@angular/core';
import { AlertController } from '@ionic/angular';

import {
  DatabaseService,
  appointmentDateTime,
  appointmentStatus
} from './database.service';

const REMINDED_KEY = 'petcareReminded';
// Each appointment is reminded 3 times: 30, 15 and 1 minute before.
const REMIND_AT_MINUTES = [30, 15, 1];
// Often enough that the 1-minute reminder is not late.
const CHECK_EVERY_MS = 15 * 1000;
// A soft "ding-ding" (notes in Hz), played with each reminder.
const CHIME_NOTES = [1046.5, 1318.5, 1568];

// Pops a reminder (with a sound) 30, 15 and 1 minute before each pending
// appointment.
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private timer?: ReturnType<typeof setInterval>;
  private audio?: AudioContext;

  constructor(
    private db: DatabaseService,
    private alertController: AlertController
  ) {
    // Browsers only allow sound after the user has tapped or typed on the
    // page, so get the sound ready on the first tap/key press.
    const unlock = () => {
      if (this.getAudio()?.state === 'running') {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      }
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
  }

  start(): void {
    if (this.timer) {
      return;
    }

    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  // Ask for browser notifications so reminders also show outside the tab.
  requestPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }

  // Shows a sample reminder right away, to check that notifications work.
  async test(): Promise<void> {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => undefined);
    }

    const message =
      'This is a test. Real reminders show 30, 15 and 1 minute before each appointment.';
    this.playChime(2);
    this.showBrowserNotification(message);

    const blocked = 'Notification' in window && Notification.permission === 'denied';
    await this.showAlert(blocked
      ? `${message} (Notifications are blocked in this browser, so only this pop-up shows. Allow them in the browser’s site settings.)`
      : message);
  }

  private async check(): Promise<void> {
    if (!this.db.currentUserId) {
      return;
    }

    const now = new Date();
    const reminded = this.readReminded();
    let appointments;

    try {
      appointments = await this.db.getAppointments();
    } catch {
      return;
    }

    for (const appointment of appointments) {
      const msLeft = appointmentDateTime(appointment).getTime() - now.getTime();

      if (appointmentStatus(appointment, now) !== 'Pending' || msLeft < 0) {
        continue;
      }

      // Reminder times already reached, e.g. 10 minutes left -> [30, 15].
      const reached = REMIND_AT_MINUTES.filter(minutes => msLeft <= minutes * 60 * 1000);

      if (!reached.length) {
        continue;
      }

      const keyFor = (minutes: number) =>
        `${appointment.id}@${appointment.date} ${appointment.time}#${minutes}`;

      // Only the latest one is shown; if the app was opened late, the earlier
      // ones are skipped instead of popping up all at once.
      if (reminded.includes(keyFor(Math.min(...reached)))) {
        continue;
      }

      reached.forEach(minutes => {
        if (!reminded.includes(keyFor(minutes))) {
          reminded.push(keyFor(minutes));
        }
      });
      this.saveReminded(reminded);

      const minutes = Math.max(1, Math.round(msLeft / 60000));
      const what = appointment.purpose ? ` (${appointment.purpose})` : '';
      const message =
        `${appointment.petName}'s appointment${what} with ${appointment.doctorName} ` +
        `is in ${minutes} minute${minutes === 1 ? '' : 's'} (${appointment.time}).`;

      // Longer sound for the last (1-minute) reminder.
      this.playChime(minutes <= 1 ? 4 : 2);
      this.showBrowserNotification(message);
      await this.showAlert(message);
    }
  }

  private getAudio(): AudioContext | undefined {
    try {
      this.audio ??= new AudioContext();

      if (this.audio.state === 'suspended') {
        void this.audio.resume();
      }
    } catch {
      return undefined;
    }

    return this.audio;
  }

  // Plays the chime `times` times, made with the Web Audio API (no sound file).
  private playChime(times: number): void {
    const audio = this.getAudio();

    if (!audio) {
      return;
    }

    const start = audio.currentTime + 0.05;

    for (let round = 0; round < times; round++) {
      CHIME_NOTES.forEach((frequency, i) => {
        const at = start + round * 0.9 + i * 0.16;
        const tone = audio.createOscillator();
        const volume = audio.createGain();

        tone.type = 'sine';
        tone.frequency.value = frequency;
        // Quick start, soft bell-like fade.
        volume.gain.setValueAtTime(0.0001, at);
        volume.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
        volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);

        tone.connect(volume).connect(audio.destination);
        tone.start(at);
        tone.stop(at + 0.65);
      });
    }
  }

  private async showAlert(message: string): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Appointment Reminder',
      message,
      buttons: ['OK']
    });

    await alert.present();
    await alert.onDidDismiss();
  }

  private showBrowserNotification(message: string): void {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('PetCare Appointment Reminder', { body: message });
      }
    } catch {
      // Some webviews expose Notification but refuse to construct it.
    }
  }

  private readReminded(): string[] {
    try {
      const value = JSON.parse(localStorage.getItem(REMINDED_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  private saveReminded(keys: string[]): void {
    // Keep the list small; old keys are for appointments long past.
    localStorage.setItem(REMINDED_KEY, JSON.stringify(keys.slice(-300)));
  }
}
