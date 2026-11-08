import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DatabaseService } from './database.service';

export const authGuard: CanActivateFn = () => {
  const db = inject(DatabaseService);
  return db.currentUserId ? true : inject(Router).parseUrl('/login');
};

// Still logged in from a previous visit: skip the login/register screens.
export const guestGuard: CanActivateFn = () => {
  const db = inject(DatabaseService);
  return db.currentUserId ? inject(Router).parseUrl('/dashboard') : true;
};
