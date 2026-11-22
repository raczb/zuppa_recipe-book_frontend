import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'theme';

  isDarkMode = signal<boolean>(this.getInitialTheme());

  constructor() {
    effect(() => {
      const dark = this.isDarkMode();
      if (typeof document !== 'undefined') {
        if (dark) {
          document.documentElement.setAttribute('data-theme', 'dark');
          localStorage.setItem(this.THEME_STORAGE_KEY, 'dark');
        } else {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem(this.THEME_STORAGE_KEY, 'light');
        }
      }
    });
  }

  toggleTheme() {
    this.isDarkMode.update(v => !v);
  }

  private getInitialTheme(): boolean {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.THEME_STORAGE_KEY) === 'dark';
    }
    return false;
  }
}
