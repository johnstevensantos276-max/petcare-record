import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface User {
  id?: number;
  fullName: string;
  username: string;
  accountType?: AccountType;
  // Whether a Recovery PIN is set (from the server).
  hasPin?: boolean;
}

export interface NewUser extends Omit<User, 'id' | 'hasPin'> {
  password: string;
  // 4 numbers, used for Forgot Password.
  recoveryPin: string;
}

export function isPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export const PIN_RULE = 'The Recovery PIN must be exactly 4 numbers.';

// Pet types offered in the forms; anything else is a user-specified "Other".
export const PET_TYPES = ['Dog', 'Cat', 'Bird', 'Rabbit'];

export function isVaccinated(pet: Pick<PetRecord, 'vaccinationStatus'>): boolean {
  return (pet.vaccinationStatus ?? '').trim().toLowerCase() === 'vaccinated';
}

// For a date that comes back every year (birthday, day a pet passed away):
// how many years ago it was, if today is that day; else null. Feb 29 is
// marked on Feb 28 in other years.
function yearsAgoToday(date: string | undefined, now: Date): number | null {
  const match = date?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match.map(Number);
  const leapYear = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
  const marked = month === 2 && day === 29 && !leapYear ? 28 : day;
  const years = now.getFullYear() - year;

  return month === now.getMonth() + 1 && marked === now.getDate() && years >= 0
    ? years
    : null;
}

// If today is the pet's birthday: the age they turn (0 if born today), else null.
export function birthdayAge(pet: Pick<PetRecord, 'birthday'>, now = new Date()): number | null {
  return yearsAgoToday(pet.birthday, now);
}

// If today is the anniversary of the day the pet passed away: how many years
// ago (1 or more), else null.
export function memorialYears(pet: Pick<PetRecord, 'passedAwayOn'>, now = new Date()): number | null {
  const years = yearsAgoToday(pet.passedAwayOn, now);
  return years !== null && years >= 1 ? years : null;
}

// Today's date (or the given date) as YYYY-MM-DD in local time.
export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function toDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time || '00:00'}`);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Same rule as the server: 6+ characters with letters and numbers.
export function isStrongPassword(password: string): boolean {
  return password.length >= 6 && /[a-z]/i.test(password) && /\d/.test(password);
}

export const PASSWORD_RULE =
  'Password must be at least 6 characters and include letters and numbers.';

// Which button made the account. The Google / Facebook buttons are a
// look-alike sign-in for PetCare, not connected to the real services.
export type AccountType = 'email' | 'google' | 'facebook';

// How a login is saved: emails in lowercase, anything else without spaces.
export function normalizeLogin(value: string): string {
  const login = value.trim();
  return isEmail(login) ? login.toLowerCase() : login.replace(/[\s\-()]/g, '').toLowerCase();
}

// The Facebook button is not connected to the real Facebook, so any email,
// mobile number or username (3+ characters, no spaces) is accepted.
export function isFacebookLogin(value: string): boolean {
  return /^\S{3,60}$/.test(normalizeLogin(value));
}

export interface VaccineRecord {
  name: string;
  purpose: string;
  date: string;
}

export interface PetRecord {
  id?: number;
  userId: number;
  petName: string;
  petType: string;
  breed: string;
  birthday: string;
  ownerName: string;
  vaccinationStatus: string;
  vaccines?: VaccineRecord[];
  // Resized JPEG data URL taken with the camera or picked from the gallery.
  photo?: string;
  // YYYY-MM-DD; set when the pet passed away (it is then shown in Memories).
  passedAwayOn?: string;
}

export interface Appointment {
  id?: number;
  userId: number;
  petId: number;
  petName: string;
  doctorName: string;
  // What the appointment is for, e.g. "Vaccination". Older records have none.
  purpose?: string;
  date: string;
  time: string;
  // Older records have no status; treat them as 'Pending'.
  // 'Missed' is stored when the user marks it (only allowed once the
  // appointment time has passed), and is also shown for any pending
  // appointment whose date is over.
  status?: 'Pending' | 'Completed' | 'Missed';
}

export type AppointmentStatus = 'Pending' | 'Completed' | 'Missed';

// Choices for what an appointment is for; "Other" lets the user type one.
export const APPOINTMENT_PURPOSES = [
  'Check-up',
  'Vaccination',
  'Deworming',
  'Grooming',
  'Dental Care',
  'Surgery',
  'Follow-up',
  'Other'
];

export function appointmentDateTime(appointment: Appointment): Date {
  return toDateTime(appointment.date, appointment.time);
}

export function appointmentStatus(
  appointment: Appointment,
  now = new Date()
): AppointmentStatus {
  if (appointment.status === 'Completed' || appointment.status === 'Missed') {
    return appointment.status;
  }

  const endOfDay = new Date(`${appointment.date}T23:59:59.999`);
  return endOfDay < now ? 'Missed' : 'Pending';
}

// The user can only mark an appointment as missed after its time has passed.
export function canMarkMissed(
  appointment: Appointment,
  now = new Date()
): boolean {
  return (
    appointmentStatus(appointment, now) === 'Pending' &&
    appointmentDateTime(appointment) <= now
  );
}

export type HistoryAction =
  | 'login'
  | 'logout'
  | 'profile-updated'
  | 'password-changed'
  | 'pin-changed'
  | 'password-reset'
  | 'pet-added'
  | 'pet-updated'
  | 'pet-deleted'
  | 'pet-passed-away'
  | 'pet-restored'
  | 'appointment-added'
  | 'appointment-completed'
  | 'appointment-missed'
  | 'appointment-deleted'
  | 'appointment-rescheduled';

export interface HistoryEntry {
  id?: number;
  userId: number;
  action: HistoryAction;
  title: string;
  details: string;
  createdAt: string;
}

interface Session {
  token: string;
  user: User;
}

const SESSION_KEY = 'petcareSession';

// Thrown for a failed server request; `status` is 0 when it was unreachable.
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Every account lives on the PetCare server (server/server.js, SQLite), so
// the same login works on any device that can reach it.
@Injectable({ providedIn: 'root' })
export class DatabaseService {
  // The server also serves the app, so by default the API is on the same
  // address. Only `ng serve` (port 4200) needs to point at port 3000.
  private readonly apiUrl = environment.apiUrl ||
    (location.port === '4200' ? `${location.protocol}//${location.hostname}:3000` : '');

  private session: Session | null = this.readSession();

  // ---------- Users / session ----------

  async register(user: NewUser): Promise<void> {
    await this.request('POST', '/api/register', user);
  }

  async login(username: string, password: string): Promise<User | null> {
    let session: Session;

    try {
      session = await this.request<Session>('POST', '/api/login', {
        username: normalizeLogin(username),
        password
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return null;
      }

      throw error;
    }

    return this.startSession(session);
  }

  // The Google / Facebook buttons: signs in, or makes the account the first
  // time this email is used (then the Recovery PIN is needed too).
  async quickLogin(
    username: string,
    password: string,
    accountType: AccountType,
    recoveryPin: string
  ): Promise<User> {
    const session = await this.request<Session>('POST', '/api/login/quick', {
      username: normalizeLogin(username),
      password,
      accountType,
      recoveryPin
    });
    return this.startSession(session);
  }

  // ---------- Profile (while logged in) ----------

  async updateProfile(fullName: string): Promise<User> {
    const user = await this.request<User>('PUT', '/api/me', { fullName });

    if (this.session) {
      this.saveSession({ ...this.session, user });
    }

    await this.log('profile-updated', 'Profile updated', `Your name is now ${user.fullName}`);
    return user;
  }

  // `verify` is the current password or the Recovery PIN, so a forgotten
  // password can be changed without logging out.
  async changePassword(verify: string, password: string): Promise<void> {
    await this.request('POST', '/api/me/password', { verify, password });
  }

  async changePin(verify: string, pin: string): Promise<void> {
    await this.request('POST', '/api/me/pin', { verify, pin });
  }

  private async startSession(session: Session): Promise<User> {
    this.saveSession(session);
    await this.log('login', 'Logged in', `Welcome back, ${session.user.fullName}!`);
    return session.user;
  }

  logout(): void {
    if (this.session) {
      void this.request('POST', '/api/logout').catch(() => undefined);
    }

    this.saveSession(null);
  }

  get currentUserId(): number | null {
    return this.session?.user.id ?? null;
  }

  async getCurrentUser(): Promise<User | null> {
    if (!this.session) {
      return null;
    }

    try {
      const user = await this.request<User>('GET', '/api/me');
      this.saveSession({ ...this.session, user });
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return null;
      }

      // Offline: fall back to the name saved at login.
      return this.session.user;
    }
  }

  // Forgot Password: the email + 4-digit Recovery PIN set a new password.
  async resetPassword(username: string, pin: string, password: string): Promise<void> {
    await this.request('POST', '/api/password-reset', {
      username: normalizeLogin(username),
      pin,
      password
    });
  }

  // ---------- Pets ----------

  // Living pets only; pets that passed away are in getMemorialPets().
  async getPets(): Promise<PetRecord[]> {
    return (await this.getAllPets()).filter(pet => !pet.passedAwayOn);
  }

  // Pets that passed away, most recent first.
  async getMemorialPets(): Promise<PetRecord[]> {
    return (await this.getAllPets())
      .filter(pet => pet.passedAwayOn)
      .sort((a, b) => b.passedAwayOn!.localeCompare(a.passedAwayOn!));
  }

  private getAllPets(): Promise<PetRecord[]> {
    return this.session
      ? this.request<PetRecord[]>('GET', '/api/pets')
      : Promise.resolve([]);
  }

  // Moves the pet to Memories. Returns how many upcoming appointments were
  // cancelled with it.
  async markPassedAway(id: number, date: string): Promise<number> {
    const pet = await this.getPet(id);

    if (!pet) {
      throw new Error('Pet record not found.');
    }

    const { cancelledAppointments } = await this.request<{ cancelledAppointments: number }>(
      'PATCH',
      `/api/pets/${id}`,
      { passedAwayOn: date }
    );

    await this.log(
      'pet-passed-away',
      `Remembering ${pet.petName}`,
      `${pet.petType} · passed away on ${date}`
    );

    return cancelledAppointments;
  }

  // Brings a pet back from Memories (e.g. marked by mistake).
  async restorePet(id: number): Promise<void> {
    const pet = await this.getPet(id);

    if (!pet) {
      throw new Error('Pet record not found.');
    }

    await this.request('PATCH', `/api/pets/${id}`, { passedAwayOn: null });
    await this.log('pet-restored', `Restored ${pet.petName}`, 'Moved back to My Pets');
  }

  async getPet(id: number): Promise<PetRecord | null> {
    try {
      return await this.request<PetRecord>('GET', `/api/pets/${id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async addPet(pet: Omit<PetRecord, 'id' | 'userId'>): Promise<number> {
    const { id } = await this.request<{ id: number }>('POST', '/api/pets', pet);

    await this.log(
      'pet-added',
      `Registered ${pet.petName}`,
      `${pet.petType}${pet.breed ? ' · ' + pet.breed : ''} · ${pet.vaccinationStatus}`
    );

    return id;
  }

  async updatePet(
    id: number,
    changes: Omit<PetRecord, 'id' | 'userId'>
  ): Promise<void> {
    const pet = await this.getPet(id);

    if (!pet) {
      throw new Error('Pet record not found.');
    }

    // The server also renames the pet in its appointments.
    await this.request('PUT', `/api/pets/${id}`, changes);

    await this.log(
      'pet-updated',
      `Updated ${changes.petName}'s record`,
      this.describePetChanges(pet, changes)
    );
  }

  private describePetChanges(
    before: PetRecord,
    after: Omit<PetRecord, 'id' | 'userId'>
  ): string {
    const changes: string[] = [];
    const fields: [keyof typeof after, string][] = [
      ['petName', 'Name'],
      ['petType', 'Type'],
      ['breed', 'Breed'],
      ['birthday', 'Birthday'],
      ['ownerName', 'Owner'],
      ['vaccinationStatus', 'Vaccination']
    ];

    if ((before.photo ?? '') !== (after.photo ?? '')) {
      changes.push(after.photo ? 'Photo updated' : 'Photo removed');
    }

    for (const [key, label] of fields) {
      const from = String(before[key] ?? '') || 'none';
      const to = String(after[key] ?? '') || 'none';

      if (from !== to) {
        changes.push(`${label}: ${from} → ${to}`);
      }
    }

    const describe = (v: VaccineRecord) =>
      `${v.name} (${v.purpose ? 'for ' + v.purpose + ', ' : ''}${v.date})`;
    const key = (v: VaccineRecord) => `${v.name}|${v.purpose}|${v.date}`;
    const oldVaccines = before.vaccines ?? [];
    const newVaccines = after.vaccines ?? [];
    const oldKeys = oldVaccines.map(key);
    const newKeys = newVaccines.map(key);

    const added = newVaccines.filter(v => !oldKeys.includes(key(v)));
    const removed = oldVaccines.filter(v => !newKeys.includes(key(v)));

    if (added.length) {
      changes.push(`Added vaccine: ${added.map(describe).join(', ')}`);
    }

    if (removed.length) {
      changes.push(`Removed vaccine: ${removed.map(describe).join(', ')}`);
    }

    return changes.length ? changes.join(' · ') : 'No changes';
  }

  async deletePet(id: number): Promise<void> {
    const pet = await this.getPet(id);

    if (!pet) {
      throw new Error('Pet record not found.');
    }

    // The server removes the pet's appointments along with it.
    await this.request('DELETE', `/api/pets/${id}`);

    await this.log(
      'pet-deleted',
      `Deleted ${pet.petName}`,
      `${pet.petType} record and its appointments were removed`
    );
  }

  // ---------- Appointments ----------

  getAppointments(): Promise<Appointment[]> {
    return this.session
      ? this.request<Appointment[]>('GET', '/api/appointments')
      : Promise.resolve([]);
  }

  async addAppointment(
    appointment: Omit<Appointment, 'id' | 'userId'>
  ): Promise<number> {
    if (toDateTime(appointment.date, appointment.time) <= new Date()) {
      throw new Error('Appointments must be booked for a future date and time.');
    }

    const { id } = await this.request<{ id: number }>(
      'POST',
      '/api/appointments',
      appointment
    );

    await this.log(
      'appointment-added',
      `Booked ${appointment.purpose ?? 'an appointment'} for ${appointment.petName}`,
      `${appointment.doctorName} · ${appointment.date} ${appointment.time}`
    );

    return id;
  }

  completeAppointment(id: number): Promise<void> {
    return this.setAppointmentStatus(id, 'Completed');
  }

  missAppointment(id: number): Promise<void> {
    return this.setAppointmentStatus(id, 'Missed');
  }

  private async setAppointmentStatus(
    id: number,
    status: 'Completed' | 'Missed'
  ): Promise<void> {
    const appointment = (await this.getAppointments()).find(item => item.id === id);

    if (!appointment) {
      return;
    }

    if (status === 'Missed' && !canMarkMissed(appointment)) {
      throw new Error('This appointment has not happened yet.');
    }

    await this.request('PATCH', `/api/appointments/${id}`, { status });

    await this.log(
      status === 'Completed' ? 'appointment-completed' : 'appointment-missed',
      `${status === 'Completed' ? 'Completed' : 'Missed'} appointment for ${appointment.petName}`,
      `${appointment.doctorName} · ${appointment.date} ${appointment.time}`
    );
  }

  // Gives a missed appointment a new doctor, date and time; it is pending again.
  async rescheduleAppointment(
    id: number,
    changes: Pick<Appointment, 'doctorName' | 'purpose' | 'date' | 'time'>
  ): Promise<void> {
    const appointment = (await this.getAppointments()).find(item => item.id === id);

    if (!appointment) {
      throw new Error('Appointment not found.');
    }

    if (toDateTime(changes.date, changes.time) <= new Date()) {
      throw new Error('Please choose a future date and time.');
    }

    await this.request('PUT', `/api/appointments/${id}`, changes);

    await this.log(
      'appointment-rescheduled',
      `Rescheduled appointment for ${appointment.petName}`,
      `${changes.doctorName} · ${changes.date} ${changes.time} ` +
        `(was ${appointment.date} ${appointment.time})`
    );
  }

  async deleteAppointment(id: number): Promise<void> {
    const appointment = (await this.getAppointments()).find(item => item.id === id);

    if (!appointment) {
      throw new Error('Appointment not found.');
    }

    await this.request('DELETE', `/api/appointments/${id}`);

    await this.log(
      'appointment-deleted',
      `Cancelled appointment for ${appointment.petName}`,
      `${appointment.doctorName} · ${appointment.date} ${appointment.time}`
    );
  }

  // ---------- History ----------

  getHistory(): Promise<HistoryEntry[]> {
    return this.session
      ? this.request<HistoryEntry[]>('GET', '/api/history')
      : Promise.resolve([]);
  }

  async clearHistory(): Promise<void> {
    if (this.session) {
      await this.request('DELETE', '/api/history');
    }
  }

  private async log(
    action: HistoryAction,
    title: string,
    details: string
  ): Promise<void> {
    if (!this.session) {
      return;
    }

    try {
      await this.request('POST', '/api/history', { action, title, details });
    } catch (error) {
      // History is a convenience; never block the real action because of it.
      console.error('Unable to save history:', error);
    }
  }

  // ---------- Server ----------

  private async request<T = void>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.session) {
      headers['Authorization'] = `Bearer ${this.session.token}`;
    }

    let response: Response;

    try {
      response = await fetch(this.apiUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new ApiError(
        'Cannot reach the PetCare server. Check your internet or Wi-Fi connection.',
        0
      );
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      // Logged out on the server (e.g. password changed on another device).
      if (response.status === 401 && this.session && path !== '/api/login') {
        this.saveSession(null);
      }

      throw new ApiError(data?.error || 'Something went wrong.', response.status);
    }

    return data as T;
  }

  private readSession(): Session | null {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return session?.token && session?.user?.id ? session : null;
    } catch {
      return null;
    }
  }

  private saveSession(session: Session | null): void {
    this.session = session;

    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }
}
