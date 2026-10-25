import type { DocumentRequirement } from '@/api/model';
import { ApiError } from '@/shared/api/errors';
import { stepOfField, type StepDef } from './draft';

// Что мешает отправить заявку: текст и шаг, на котором это правится
export type Problem = { key: string; text: string; step: number };

const asText = (value: unknown) =>
  typeof value === 'string' ? value : Array.isArray(value) ? String(value[0]) : null;

// Ответ submit при 400: details = {missing_fields, errors, missing_documents}
// (apps/applications/services.py, check_completeness)
export const problemsFromSubmitError = (error: unknown, steps: StepDef[]): Problem[] | null => {
  if (!(error instanceof ApiError) || error.code !== 'validation_error') return null;
  const { missing_fields, errors, missing_documents } = error.details as {
    missing_fields?: Record<string, unknown>;
    errors?: Record<string, unknown>;
    missing_documents?: { doc_type: string; name: string }[];
  };
  if (!missing_fields && !errors && !missing_documents) return null;

  const documentsStep = steps.findIndex((s) => s.key === 'documents');
  const fieldProblems = Object.entries({ ...missing_fields, ...errors }).flatMap(
    ([field, value]) => {
      const text = asText(value);
      return text ? [{ key: field, text, step: Math.max(stepOfField(steps, field), 0) }] : [];
    },
  );
  const documentProblems = (missing_documents ?? []).map((doc) => ({
    key: `doc-${doc.doc_type}`,
    text: `Загрузите документ: ${doc.name}`,
    step: documentsStep,
  }));
  return [...fieldProblems, ...documentProblems];
};

export const problemsFromMissingDocuments = (
  missing: DocumentRequirement[],
  steps: StepDef[],
): Problem[] => {
  const documentsStep = steps.findIndex((s) => s.key === 'documents');
  return missing.map((doc) => ({
    key: `doc-${doc.doc_type}`,
    text: `Загрузите документ: ${doc.name}`,
    step: documentsStep,
  }));
};
