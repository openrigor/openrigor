export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswords(
  password: string,
  confirmPassword: string
): string | null {
  if (!password) {
    return "Enter a new password.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}
