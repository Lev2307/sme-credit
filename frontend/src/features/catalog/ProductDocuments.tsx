import { Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import type { Company } from '@/api/model';
import { useProductsDocumentsList } from '@/api/products/products';
import { ErrorState } from '@/shared/ui/ErrorState';
import classes from './ProductDocuments.module.css';

type Props = {
  productCode: string;
  company: Company;
};

// Список документов виден до начала заявки и зависит от продукта, формы бизнеса и налогового
// режима (docs/01-research.md, этап 4)
export function ProductDocuments({ productCode, company }: Props) {
  const documents = useProductsDocumentsList(
    productCode,
    { legal_form: company.legal_form, tax_regime: company.tax_regime },
    { query: { staleTime: 5 * 60_000 } },
  );
  const headingId = `docs-${productCode}`;

  return (
    <section aria-labelledby={headingId}>
      <Title order={4} id={headingId} mb="xs">
        Какие документы понадобятся
      </Title>

      {documents.isPending && (
        <Stack gap="xs" aria-hidden>
          <Skeleton height={20} width="70%" />
          <Skeleton height={20} width="55%" />
        </Stack>
      )}

      {documents.isError && (
        <ErrorState
          error={documents.error}
          title="Не удалось загрузить список документов"
          onRetry={() => documents.refetch()}
          retrying={documents.isFetching}
        />
      )}

      {documents.isSuccess && documents.data.length === 0 && (
        <Text size="sm" c="dimmed">
          Документы не нужны: банк проверит всё по реестрам.
        </Text>
      )}

      {documents.isSuccess && documents.data.length > 0 && (
        <ul className={classes.list}>
          {documents.data.map((doc) => (
            <li key={doc.doc_type} className={classes.item}>
              <IconFileText size={20} aria-hidden className={classes.icon} />
              <div className={classes.text}>
                <Text size="sm" fw={500}>
                  {doc.name}
                  {doc.is_required === false && (
                    <Text span size="sm" c="dimmed" fw={400}>
                      {' '}
                      (по желанию)
                    </Text>
                  )}
                </Text>
                {doc.hint && (
                  <Text size="sm" c="dimmed">
                    {doc.hint}
                  </Text>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
