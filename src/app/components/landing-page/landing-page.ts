import { Component, inject, signal, output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { ThemeService } from '../../services/theme';
import { IconsComponent } from '../icons/icons';

export type AuthMode = 'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD' | 'RESET_PASSWORD' | 'VERIFICATION_SENT';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [CommonModule, FormsModule, IconsComponent],
  templateUrl: './landing-page.html',
  styleUrl: './landing-page.css'
})
export class LandingPageComponent implements OnInit {
  // Outputs emitted to parent AppComponent
  authSuccess = output<void>();
  exploreAsGuest = output<void>();

  // Injected services
  authService = inject(AuthService);
  themeService = inject(ThemeService);

  // Active form view state
  authMode = signal<AuthMode>('LOGIN');
  errorMessage = signal<string>('');
  infoMessage = signal<string>('');
  isLoading = signal<boolean>(false);
  lastRegisteredEmail = signal<string>('');

  // 1. Sign In Form Model
  loginEmail = '';
  loginPassword = '';
  loginPasswordVisible = false;

  // 2. 2FA (Google Authenticator) Popup Modal State
  isMfaModalOpen = signal<boolean>(false);
  mfaToken = signal<string>('');
  mfaCode = '';
  mfaError = signal<string>('');
  isVerifyingMfa = signal<boolean>(false);

  // 3. Forgot Password Model
  forgotEmail = '';

  // 4. Reset Password (New Password with Token) Model
  resetToken = '';
  resetNewPassword = '';
  resetConfirmPassword = '';
  resetNewPasswordVisible = false;
  resetConfirmPasswordVisible = false;

  // 5. Registration Model
  regFirstName = '';
  regLastName = '';
  regEmail = '';
  regPassword = '';
  regConfirmPassword = '';
  regPasswordVisible = false;
  regConfirmVisible = false;

  ngOnInit() {
    // Check if URL contains a password reset token (e.g., http://localhost:4200/?resetToken=XYZ)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const resetToken = urlParams.get('resetToken') || (!urlParams.get('email') ? urlParams.get('token') : null);
      if (resetToken) {
        this.resetToken = resetToken;
        this.setAuthMode('RESET_PASSWORD');
      }
    }
  }

  /**
   * Switches active authentication card view (LOGIN, REGISTER, FORGOT_PASSWORD, RESET_PASSWORD)
   */
  setAuthMode(mode: AuthMode) {
    this.authMode.set(mode);
    this.errorMessage.set('');
    this.infoMessage.set('');
  }

  /**
   * Submits credentials to Spring Boot backend (/api/auth/login).
   * If 2FA is enabled for the user, opens the 6-digit Google Authenticator popup modal.
   */
  async handleLogin() {
    this.errorMessage.set('');
    this.infoMessage.set('');
    if (!this.loginEmail.trim() || !this.loginPassword.trim()) {
      this.errorMessage.set('Please provide both email and password');
      return;
    }

    this.isLoading.set(true);
    try {
      const result = await this.authService.login(this.loginEmail.trim(), this.loginPassword);
      if (result.mfaRequired) {
        this.mfaToken.set(result.mfaToken);
        this.mfaCode = '';
        this.mfaError.set('');
        this.isMfaModalOpen.set(true);
      } else {
        this.authSuccess.emit();
      }
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Submits the 6-digit Google Authenticator code to (/api/auth/mfa/verify)
   */
  async handleVerifyMfa() {
    this.mfaError.set('');
    const cleanCode = this.mfaCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      this.mfaError.set('Please enter a valid 6-digit code from Google Authenticator.');
      return;
    }

    this.isVerifyingMfa.set(true);
    try {
      await this.authService.verifyMfaLogin(this.mfaToken(), cleanCode);
      this.isMfaModalOpen.set(false);
      this.authSuccess.emit();
    } catch (err: any) {
      this.mfaError.set(err.message || 'Invalid 6-digit verification code.');
    } finally {
      this.isVerifyingMfa.set(false);
    }
  }

  /**
   * Closes the 2FA popup modal so the user can re-enter credentials if needed
   */
  closeMfaModal() {
    this.isMfaModalOpen.set(false);
    this.mfaCode = '';
    this.mfaError.set('');
  }

  /**
   * Submits email to Spring Boot backend (/api/auth/forgot-password) to dispatch reset instructions
   */
  async handleForgotPassword() {
    this.errorMessage.set('');
    this.infoMessage.set('');
    if (!this.forgotEmail.trim()) {
      this.errorMessage.set('Please enter your email address');
      return;
    }

    this.isLoading.set(true);
    try {
      const responseMsg = await this.authService.forgotPassword(this.forgotEmail.trim());
      this.infoMessage.set(responseMsg || `A password reset link has been sent to ${this.forgotEmail.trim()}`);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Could not send password reset email');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Submits new password and token to Spring Boot backend (/api/auth/reset-password)
   */
  async handleResetPassword() {
    this.errorMessage.set('');
    this.infoMessage.set('');

    if (!this.resetToken.trim()) {
      this.errorMessage.set('Password reset token is missing or expired.');
      return;
    }
    if (!this.resetNewPassword.trim() || !this.resetConfirmPassword.trim()) {
      this.errorMessage.set('Please enter and confirm your new password');
      return;
    }
    if (this.resetNewPassword !== this.resetConfirmPassword) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    try {
      const msg = await this.authService.resetPassword({
        token: this.resetToken.trim(),
        newPassword: this.resetNewPassword,
        confirmPassword: this.resetConfirmPassword
      });
      this.infoMessage.set(msg || 'Password updated successfully! Please sign in with your new password.');
      setTimeout(() => {
        this.setAuthMode('LOGIN');
      }, 2000);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Password reset failed. The token may be invalid or expired.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Submits new account details to Spring Boot backend (/api/auth/register)
   */
  async handleRegister() {
    this.errorMessage.set('');
    this.infoMessage.set('');
    if (!this.regFirstName.trim() || !this.regLastName.trim() || !this.regEmail.trim()) {
      this.errorMessage.set('Please fill in your name and email');
      return;
    }
    if (!this.regPassword.trim() || !this.regConfirmPassword.trim()) {
      this.errorMessage.set('Please create and confirm your password');
      return;
    }
    if (this.regPassword !== this.regConfirmPassword) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    this.isLoading.set(true);
    try {
      await this.authService.register({
        firstName: this.regFirstName.trim(),
        lastName: this.regLastName.trim(),
        email: this.regEmail.trim(),
        password: this.regPassword,
        confirmPassword: this.regConfirmPassword
      });

      this.lastRegisteredEmail.set(this.regEmail.trim());
      this.authMode.set('VERIFICATION_SENT');
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Registration failed');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Google OAuth2 login handler — redirects to Spring Boot OAuth2 endpoint
   */
  handleGoogleLogin() {
    this.errorMessage.set('');
    this.infoMessage.set('');
    this.isLoading.set(true);
    this.authService.loginWithGoogle();
  }

  /**
   * Calls Spring Boot backend to resend verification email (/api/auth/resend-verification-email)
   */
  async resendVerificationEmail() {
    this.errorMessage.set('');
    this.infoMessage.set('');
    const email = this.lastRegisteredEmail();
    if (!email) return;

    try {
      const msg = await this.authService.resendVerificationEmail(email);
      this.infoMessage.set(msg || `Verification email resent to ${email}`);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Failed to resend verification email');
    }
  }
}
