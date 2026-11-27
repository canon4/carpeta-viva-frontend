import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AppConfigService } from '../config/app-config';
import { AuthService } from './auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const apiUrl = inject(AppConfigService).apiUrl;
  if (!req.url.startsWith(apiUrl)) {
    return next(req);
  }
  const token = auth.token;
  const peticion = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(peticion).pipe(
    catchError((error: unknown) => {
      const esLoginORestaurarSesion =
        req.url.endsWith('/auth/login') || req.url.endsWith('/auth/refrescar') || req.url.endsWith('/auth/logout');
      if (error instanceof HttpErrorResponse && error.status === 401 && !esLoginORestaurarSesion) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
