import type { UserType } from '@/app/(auth)/auth';
import type { ChatModel } from './models';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay: 20,
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 100,
    availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};

/** When JWT/session omits `type` (e.g. after token prune), infer from guest email prefix. */
export function resolveUserType(
  type: UserType | undefined,
  email: string | null | undefined,
): UserType {
  if (type === 'guest' || type === 'regular') {
    return type;
  }
  if (email?.startsWith('guest-')) {
    return 'guest';
  }
  return 'regular';
}

export function entitlementsForSessionUser(opts: {
  type: UserType | undefined;
  email?: string | null;
}): Entitlements {
  const userType = resolveUserType(opts.type, opts.email);
  return entitlementsByUserType[userType];
}
