export interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  token?: string;
}

export interface MFAEnablementResponse {
  qrCodeURI: string;
  qrCodeImage: string;
  secretKey: string;
}

export interface MFAConfirmResponse {
  valid?: boolean;
  isValid?: boolean;
}
