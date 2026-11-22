import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme';
import { AuthService } from '../../services/auth';
import { IconsComponent } from '../icons/icons';
import { MFAEnablementResponse } from '../../models/recipe';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconsComponent
  ],
  templateUrl: './home-page.html',
  styleUrl: './home-page.css'
})
export class HomePageComponent {
  logout = output<void>();

  themeService = inject(ThemeService);
  authService = inject(AuthService);

  // 2FA Setup state
  isMfaSetupOpen = signal<boolean>(false);
  isLoadingMfa = signal<boolean>(false);
  isConfirmingMfa = signal<boolean>(false);
  mfaSetupData = signal<MFAEnablementResponse | null>(null);
  confirmCode = '';
  mfaSetupError = signal<string>('');
  mfaSetupSuccess = signal<string>('');

  /**
   * Calls the backend /api/auth/mfa/setup endpoint to generate a QR code for Google Authenticator
   */
  async handleOpen2faSetup() {
    this.mfaSetupError.set('');
    this.mfaSetupSuccess.set('');
    this.confirmCode = '';
    this.isMfaSetupOpen.set(true);
    this.isLoadingMfa.set(true);

    try {
      const response = await this.authService.setupMfa();
      this.mfaSetupData.set(response);
    } catch (err: any) {
      this.mfaSetupError.set(err.message || 'Could not generate 2FA QR code. Please make sure you are signed in.');
    } finally {
      this.isLoadingMfa.set(false);
    }
  }

  /**
   * Confirms the 6-digit code from Google Authenticator via /api/auth/mfa/confirm
   */
  async handleConfirm2faSetup() {
    this.mfaSetupError.set('');
    this.mfaSetupSuccess.set('');

    const cleanCode = this.confirmCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      this.mfaSetupError.set('Please enter a valid 6-digit code from Google Authenticator.');
      return;
    }

    this.isConfirmingMfa.set(true);
    try {
      const isValid = await this.authService.confirmMfaSetup(cleanCode);
      if (isValid) {
        this.mfaSetupSuccess.set('Two-Factor Authentication (2FA) has been enabled on your account!');
        this.confirmCode = '';
      } else {
        this.mfaSetupError.set('Invalid 6-digit code. Please check Google Authenticator and try again.');
      }
    } catch (err: any) {
      this.mfaSetupError.set(err.message || 'Failed to confirm 2FA code.');
    } finally {
      this.isConfirmingMfa.set(false);
    }
  }

  closeMfaSetupModal() {
    this.isMfaSetupOpen.set(false);
    this.mfaSetupError.set('');
    this.mfaSetupSuccess.set('');
  }

  handleLogout() {
    this.logout.emit();
  }
}
