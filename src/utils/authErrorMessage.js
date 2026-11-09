const messages = {
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/user-not-found': 'The email or password is incorrect.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account already uses this email. Try signing in.',
  'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
  'auth/password-does-not-meet-requirements': 'Your password does not meet the account password requirements. Choose a stronger password.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can try again.',
  'auth/cancelled-popup-request': 'Google sign-in was interrupted. Please try again.',
  'auth/popup-blocked': 'Your browser blocked the Google popup. Allow popups and try again.',
  'auth/account-exists-with-different-credential': 'This email uses another sign-in method. Sign in with your original method.',
  'auth/network-request-failed': 'Check your internet connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/unauthorized-domain': 'Sign-in is unavailable on this domain. Contact the app owner.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact the app owner.',
  'auth/web-storage-unsupported': 'Enable browser storage to keep your session and sign in.',
}

export function authErrorMessage(error) {
  return messages[error.code] || 'Authentication could not be completed. Please try again.'
}
