import type { JWT } from 'next-auth/jwt';

/** True when the NextAuth JWT carries a persisted app user id (guest or regular). */
export function jwtHasUserId(token: JWT | null): boolean {
  if (!token) {
    return false;
  }
  const id = token.id;
  return typeof id === 'string' && id.length > 0;
}
