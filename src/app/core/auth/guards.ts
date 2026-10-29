import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import type { Rol } from '../navegacion';
import { AuthService } from './auth';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? true : inject(Router).createUrlTree(['/login']);
};

export const rolGuard =
  (...roles: Rol[]): CanActivateFn =>
  () => {
    const rol = inject(AuthService).rol();
    return rol !== null && roles.includes(rol) ? true : inject(Router).createUrlTree(['/panel']);
  };
