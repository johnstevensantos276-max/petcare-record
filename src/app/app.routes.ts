
import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./login/login.page').then(m => m.LoginPage)
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./register/register.page').then(m => m.RegisterPage)
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./forgot-password/forgot-password.page').then(
        m => m.ForgotPasswordPage
      )
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.page').then(m => m.DashboardPage)
  },
  {
    path: 'pet-registration',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pet-registration/pet-registration.page').then(
        m => m.PetRegistrationPage
      )
  },
  {
    path: 'pet-cards',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pet-cards/pet-cards.page').then(m => m.PetCardsPage)
  },
  {
    path: 'pet-details',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pet-details/pet-details.page').then(
        m => m.PetDetailsPage
      )
  },
  {
    path: 'appointments',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./appointments/appointments.page').then(
        m => m.AppointmentsPage
      )
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./reports/reports.page').then(m => m.ReportsPage)
  },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./history/history.page').then(m => m.HistoryPage)
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile/profile.page').then(m => m.ProfilePage)
  },
  {
    path: 'calendar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./calendar/calendar.page').then(m => m.CalendarPage)
  },
  {
    path: 'memories',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./memories/memories.page').then(m => m.MemoriesPage)
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
