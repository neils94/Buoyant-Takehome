import { z } from 'zod';
import type {
  listKnowledgeBase,
  readKnowledgeBaseDocument,
} from './ai/tools/knowledge-base';
import type { createDocument } from './ai/tools/create-document';
import type { updateDocument } from './ai/tools/update-document';
import type { requestSuggestions } from './ai/tools/request-suggestions';
import type { createProposalPdfWorkspaceTools } from './ai/tools/proposal-pdf-workspace';
import type { InferUITool, UIMessage } from 'ai';

import type { ArtifactKind } from '@/components/artifact';
import type { Suggestion } from './db/schema';

export type DataPart = { type: 'append-message'; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type listKnowledgeBaseTool = InferUITool<typeof listKnowledgeBase>;
type readKnowledgeBaseDocumentTool = InferUITool<
  typeof readKnowledgeBaseDocument
>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;

type proposalPdfWorkspaceTools = ReturnType<
  typeof createProposalPdfWorkspaceTools
>;
type readUserProposalPdfTool = InferUITool<
  proposalPdfWorkspaceTools['readUserProposalPdf']
>;
type publishProposalPdfRevisionTool = InferUITool<
  proposalPdfWorkspaceTools['publishProposalPdfRevision']
>;

export type ChatTools = {
  listKnowledgeBase: listKnowledgeBaseTool;
  readKnowledgeBaseDocument: readKnowledgeBaseDocumentTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  readUserProposalPdf: readUserProposalPdfTool;
  publishProposalPdfRevision: publishProposalPdfRevisionTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  proposalPdfRevision: {
    previousUrl: string;
    newUrl: string;
    name: string;
  };
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}
