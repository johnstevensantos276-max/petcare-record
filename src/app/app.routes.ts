import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register.page').then(m => m.RegisterPage)
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.page').then(m => m.DashboardPage)
  },
  {
    path: 'pet-registration',
    loadComponent: () =>
      import('./pet-registration/pet-registration.page').then(m => m.PetRegistrationPage)
  },
  {
    path: 'pet-cards',
    loadComponent: () =>
      import('./pet-cards/pet-cards.page').then(m => m.PetCardsPage)
  },
  {
    path: 'appointments',
    loadComponent: () =>
      import('./appointments/appointments.page').then(m => m.AppointmentsPage)
  },
  {
    path: 'appointment-log',
    loadComponent: () =>
      import('./appointment-log/appointment-log.page').then(m => m.AppointmentLogPage)
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./reports/reports.page').then(m => m.ReportsPage)
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./profile/profile.page').then(m => m.ProfilePage)
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];