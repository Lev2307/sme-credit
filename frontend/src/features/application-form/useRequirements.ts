import type { ApplicationRetrieve, Company } from '@/api/model';
import { useProductsDocumentsList } from '@/api/products/products';

// Какие документы нужны этой заявке и каких обязательных ещё нет.
// Нужен и шагу документов, и проверке перед отправкой
export function useRequirements(application: ApplicationRetrieve, company: Company) {
  const query = useProductsDocumentsList(
    application.product,
    { legal_form: company.legal_form, tax_regime: company.tax_regime },
    { query: { staleTime: 5 * 60_000 } },
  );
  const uploaded = new Set(application.documents.map((d) => d.doc_type));
  const required = (query.data ?? []).filter((r) => r.is_required !== false);
  const missing = required.filter((r) => !uploaded.has(r.doc_type));
  return { query, required, missing };
}

export type Requirements = ReturnType<typeof useRequirements>;
