'use server';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/providers';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel('pdf-extraction-model'),
    system: `You are a senior editorial assistant for consultant proposals and qualifications across disciplines—including environmental sciences and compliance, architecture, civil and structural, MEP, geotechnical, transportation, planning, estimating, and adjacent technical fields.

You receive the user's opening message as JSON (including any file or PDF parts).
- Read every attached PDF or document carefully: identify proposal or SOQ/RFQ context, discipline, scope, entities, and whether the user wants review, redlines, or concrete edits to that PDF. Use only what the source text supports (no invention).
- Prefer concrete subject matter (project name, agency, work type, discipline, or section being edited) over generic phrases.
- Output a single line, at most 80 characters, suitable as a conversation title: grounded in the document when files are present, otherwise in the user's text.
- Do not use quotes or colons in the output.`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}
