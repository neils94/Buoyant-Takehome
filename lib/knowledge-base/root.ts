import path from 'node:path';

/**
 * On-disk knowledge base (example SOQs and related PDFs).
 * Defaults to `app/ExampleProposals/kb` under the project root.
 */
export function getKnowledgeBaseRoot(): string {
  return path.join(process.cwd(), 'app', 'ExampleProposals', 'kb');
}
