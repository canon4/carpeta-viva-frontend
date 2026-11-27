import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { AuthService } from './core/auth/auth';
import { authInterceptor } from './core/auth/interceptor';
import { AppConfigService } from './core/config/app-config';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // El config.json (dirección de la API) debe estar cargado antes de poder restaurar la
    // sesión: por eso van en el mismo inicializador, en ese orden, y no en dos separados.
    provideAppInitializer(async () => {
      const config = inject(AppConfigService);
      const auth = inject(AuthService);
      await config.load();
      await auth.intentarRestaurarSesion();
    }),
  ],
};
