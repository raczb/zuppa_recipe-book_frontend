import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { User, MFAEnablementResponse, MFAConfirmResponse } from '../models/recipe';

export type LoginResult =
  | { mfaRequired: false; user: User; token: string }
  | { mfaRequired: true; mfaToken: string; message?: string };

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Local storage keys for persisting the authenticated session in the browser
  private readonly USER_KEY = 'zuppa_user_v2';
  private readonly TOKEN_KEY = 'zuppa_token_v2';

  // Base URL pointing to the Spring Boot REST API (Zuppa)
  private readonly API_BASE_URL = environment.apiBaseUrl;
  private readonly BACKEND_ORIGIN = environment.backendOrigin;

  // Reactive signal holding the current logged in user (or null if signed out)
  currentUser = signal<User | null>(this.getStoredUser());

  private async parseErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const errorJson = await response.json();
      return errorJson.message || errorJson.error || fallback;
    } catch {
      return fallback;
    }
  }

  // =========================================================================
  // 🔌 1. USER LOGIN (Supports 2FA / MFA step)
  // =========================================================================
  async login(email: string, password: string): Promise<LoginResult> {
    if (!email || !password) {
      throw new Error('Please provide email and password');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password })
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response, 'Invalid email or password');
        throw new Error(errorMsg);
      }

      const body = await response.json();

      // Check if 2FA / MFA is enabled for this user (HTTP 202 Accepted or mfaRequired=true)
      if (response.status === 202 || body?.mfaRequired) {
        return {
          mfaRequired: true,
          mfaToken: body.mfaToken || '',
          message: body.message || 'Please enter your 6-digit Google Authenticator code.'
        };
      }

      const authHeader = response.headers.get('Authorization');
      const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : 'jwt-session-token';

      const user: User = {
        id: String(body.id || Date.now()),
        email: body.email || email,
        firstName: body.firstName || '',
        lastName: body.lastName || '',
        name: `${body.firstName || ''} ${body.lastName || ''}`.trim() || email.split('@')[0],
        token
      };

      this.saveSession(user, token);
      return { mfaRequired: false, user, token };
    } catch (err: any) {
      console.error('Login error:', err);
      throw err;
    }
  }

  // =========================================================================
  // 🔐 1B. VERIFY 2FA CODE DURING LOGIN (/api/auth/mfa/verify)
  // =========================================================================
  async verifyMfaLogin(mfaToken: string, code: string): Promise<{ user: User; token: string }> {
    if (!code || !code.trim()) {
      throw new Error('Please enter the 6-digit verification code');
    }

    const response = await fetch(`${this.API_BASE_URL}/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        mfaToken: mfaToken.trim(),
        code: code.trim()
      })
    });

    // Note: MFAFilter redirects to GET /api/auth/login on invalid code or token
    if (!response.ok || response.redirected || response.url.includes('/api/auth/login')) {
      throw new Error('Invalid or expired 6-digit verification code. Please try logging in again.');
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Invalid 6-digit verification code. Please sign in again.');
    }

    const authHeader = response.headers.get('Authorization');
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : 'jwt-session-token';

    const userSummary = await response.json();
    if (!userSummary || (!userSummary.email && !userSummary.id)) {
      throw new Error('Verification failed. Please try again.');
    }

    const user: User = {
      id: String(userSummary.id || Date.now()),
      email: userSummary.email || '',
      firstName: userSummary.firstName || '',
      lastName: userSummary.lastName || '',
      name: `${userSummary.firstName || ''} ${userSummary.lastName || ''}`.trim() || (userSummary.email ? userSummary.email.split('@')[0] : 'Chef'),
      token
    };

    this.saveSession(user, token);
    return { user, token };
  }

  // =========================================================================
  // 🔐 1C. SETUP 2FA QR CODE (/api/auth/mfa/setup & /api/auth/mfa/confirm)
  // =========================================================================
  async setupMfa(): Promise<MFAEnablementResponse> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.API_BASE_URL}/auth/mfa/setup`, {
      method: 'POST',
      headers,
      credentials: 'include'
    });

    if (!response.ok) {
      const errorMsg = await this.parseErrorMessage(response, 'Failed to generate 2FA QR code. You may already have 2FA enabled or need to sign in.');
      throw new Error(errorMsg);
    }

    return await response.json();
  }

  async confirmMfaSetup(code: string): Promise<MFAConfirmResponse> {
    if (!code || !code.trim()) {
      throw new Error('Please enter the 6-digit code from Google Authenticator');
    }

    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.API_BASE_URL}/auth/mfa/confirm`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ code: code.trim() })
    });

    if (!response.ok) {
      const errorMsg = await this.parseErrorMessage(response, 'Invalid 6-digit code. Please try again.');
      throw new Error(errorMsg);
    }

    return await response.json();
  }

  // =========================================================================
  // 🌐 1D. GOOGLE OAUTH2 LOGIN
  // =========================================================================
  loginWithGoogle(): void {
    if (typeof window !== 'undefined') {
      window.location.href = `${this.BACKEND_ORIGIN}/oauth2/authorization/google`;
    }
  }

  handleOAuth2Callback(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const email = params.get('email');

    if (!token || !email) {
      return false;
    }

    const firstName = params.get('firstName') || '';
    const lastName = params.get('lastName') || '';
    const user: User = {
      id: String(Date.now()),
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim() || email.split('@')[0],
      token
    };

    this.saveSession(user, token);
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }

  // =========================================================================
  // 🔌 2. USER REGISTRATION
  // =========================================================================
  async register(params: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }): Promise<{ user: User }> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: params.firstName.trim(),
          lastName: params.lastName.trim(),
          email: params.email.trim(),
          password: params.password,
          confirmPassword: params.confirmPassword
        })
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response, 'Registration failed. Please check your details.');
        throw new Error(errorMsg);
      }

      const userSummary = await response.json();

      const user: User = {
        id: String(userSummary.id || Date.now()),
        email: userSummary.email || params.email,
        firstName: userSummary.firstName || params.firstName,
        lastName: userSummary.lastName || params.lastName,
        name: `${userSummary.firstName || params.firstName} ${userSummary.lastName || params.lastName}`.trim()
      };

      return { user };
    } catch (err: any) {
      console.error('Registration error:', err);
      throw err;
    }
  }

  // =========================================================================
  // 🔌 3. FORGOTTEN PASSWORD (REQUEST RESET LINK)
  // =========================================================================
  async forgotPassword(email: string): Promise<string> {
    if (!email || !email.trim()) {
      throw new Error('Please enter your email address');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() })
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response, 'Could not send reset password email');
        throw new Error(errorMsg);
      }

      const message = await response.text();
      return message || `A password reset link has been sent to ${email}`;
    } catch (err: any) {
      console.error('Forgot password error:', err);
      throw err;
    }
  }

  // =========================================================================
  // 🔌 4. RESET PASSWORD (SUBMIT NEW PASSWORD WITH TOKEN)
  // =========================================================================
  async resetPassword(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<string> {
    if (!params.token || !params.newPassword || !params.confirmPassword) {
      throw new Error('Please provide the token and new password');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response, 'Password reset failed');
        throw new Error(errorMsg);
      }

      const message = await response.text();
      return message || 'Password reset successfully!';
    } catch (err: any) {
      console.error('Reset password error:', err);
      throw err;
    }
  }

  // =========================================================================
  // 🔌 5. RESEND REGISTRATION VERIFICATION EMAIL
  // =========================================================================
  async resendVerificationEmail(email: string): Promise<string> {
    if (!email || !email.trim()) {
      throw new Error('Please specify an email to resend verification');
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/resend-verification-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() })
      });

      if (!response.ok) {
        const errorMsg = await this.parseErrorMessage(response, 'Failed to resend verification email');
        throw new Error(errorMsg);
      }

      const message = await response.text();
      return message || `Verification email resent to ${email}`;
    } catch (err: any) {
      console.error('Resend verification error:', err);
      throw err;
    }
  }

  // =========================================================================
  // 🔌 6. USER LOGOUT
  // =========================================================================
  async logout(): Promise<void> {
    try {
      await fetch(`${this.API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.warn('Backend logout request failed (clearing local state anyway):', err);
    } finally {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.USER_KEY);
        localStorage.removeItem(this.TOKEN_KEY);
      }
      this.currentUser.set(null);
    }
  }

  // =========================================================================
  // 🔒 SESSION HELPERS
  // =========================================================================
  isAuthenticated(): boolean {
    return this.currentUser() !== null;
  }

  getToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.TOKEN_KEY);
    }
    return null;
  }

  private saveSession(user: User, token: string) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      localStorage.setItem(this.TOKEN_KEY, token);
    }
    this.currentUser.set(user);
  }

  private getStoredUser(): User | null {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}
