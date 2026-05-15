import { auth } from '@/app/(auth)/auth';
import type { NextRequest } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { getChatsByUserId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const limit = Number.parseInt(searchParams.get('limit') || '10');
  const startingAfter = searchParams.get('starting_after');
  const endingBefore = searchParams.get('ending_before');

  if (startingAfter && endingBefore) {
    return new ChatSDKError(
      'bad_request:api',
      'Only one of starting_after or ending_before can be provided.',
    ).toResponse();
  }

  const session = await auth();

  /** Never 401: sidebar SWR treats non-OK as fatal; unsigned / pruned JWT should just show no history. */
  if (!session?.user?.id) {
    return Response.json({ chats: [] as Chat[], hasMore: false });
  }

  try {
    const chats = await getChatsByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });

    return Response.json(chats);
  } catch (error) {
    console.error('[GET /api/history]', error);
    return Response.json({ chats: [] as Chat[], hasMore: false });
  }
}
