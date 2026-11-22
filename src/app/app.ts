import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth';
import { LandingPageComponent } from './components/landing-page/landing-page';
import { HomePageComponent } from './components/home-page/home-page';

export type ScreenState = 'LANDING' | 'HOME';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LandingPageComponent,
    HomePageComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
  authService = inject(AuthService);

  // Application routing / screen state (Landing Page and Home Page only):
  currentScreen = signal<ScreenState>('LANDING');
  toastMessage = signal<string | null>(null);

  private toastTimer: any = null;

  ngOnInit() {
    // Handle Google OAuth2 redirect callback params if present
    if (this.authService.handleOAuth2Callback()) {
      this.handleAuthSuccess();
      return;
    }

    // Check if the user is already authenticated (from local session or token)
    if (this.authService.isAuthenticated()) {
      this.currentScreen.set('HOME');
    } else {
      this.currentScreen.set('LANDING');
    }
  }

  /**
   * Displays an animated popup toast notification across screens
   */
  showToast(msg: string, duration = 3500) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastMessage.set(msg);
    this.toastTimer = setTimeout(() => {
      this.toastMessage.set(null);
    }, duration);
  }

  /**
   * Called when a user signs in successfully (including 2FA verification)
   */
  handleAuthSuccess() {
    this.currentScreen.set('HOME');
    const user = this.authService.currentUser();
    const displayName = user?.firstName || user?.name || 'User';
    this.showToast(`Welcome back, ${displayName}!`);
  }

  /**
   * Guest Mode enabled for testing:
   * Allows visitors to browse the Homepage as a guest.
   */
  handleExploreRequest() {
    this.currentScreen.set('HOME');
    if (!this.authService.isAuthenticated()) {
      this.showToast('Browsing in Guest Mode. Welcome to Zuppa!');
    }
  }

  /**
   * Clears backend session (invalidates refresh token) and returns to Landing page
   */
  async handleLogout() {
    await this.authService.logout();
    this.currentScreen.set('LANDING');
    this.showToast('Signed out successfully.');
  }
}
