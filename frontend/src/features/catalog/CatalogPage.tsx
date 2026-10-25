import { Anchor, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useApplicationsList } from '@/api/applications/applications';
import type { ApplicationRetrieve } from '@/api/model';
import { useProductsList } from '@/api/products/products';
import { STATUS_META } from '@/features/applications/status';
import { useSession } from '@/features/auth/session';
import { LEGAL_FORM_LABELS, TAX_REGIME_LABELS } from '@/shared/lib/dictionaries';
import { usePageTitle } from '@/shared/lib/usePageTitle';
import { ErrorState } from '@/shared/ui/ErrorState';
import { PageHeading } from '@/shared/ui/PageHeading';
import { ProductCard } from './ProductCard';

const latest = (items: ApplicationRetrieve[]) =>
  items.toSorted((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

export function CatalogPage() {
  usePageTitle('Выбор кредита');
  const { data: me } = useSession();
  const products = useProductsList({ query: { staleTime: 5 * 60_000 } });
  // Заявки нужны, чтобы предложить продолжить черновик вместо нового
  const applications = useApplicationsList();

  // Страница стоит под RequireCompany, компания здесь всегда есть
  const company = me?.company;
  if (!company) return null;

  const byProduct = (code: string) => {
    const mine = (applications.data ?? []).filter((a) => a.product === code);
    return {
      draft: latest(mine.filter((a) => a.status === 'DRAFT')),
      active: latest(
        mine.filter((a) => a.status !== 'DRAFT' && STATUS_META[a.status].group !== 'final'),
      ),
    };
  };

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Anchor component={Link} to="/cabinet" size="sm" w="fit-content">
          <Group gap={4} wrap="nowrap">
            <IconArrowLeft size={16} aria-hidden />
            Мои заявки
          </Group>
        </Anchor>
        <PageHeading>Выбор кредита</PageHeading>
        <Text c="dimmed" maw="65ch">
          Сравните условия и посмотрите, какие документы понадобятся. Список подобран под{' '}
          {LEGAL_FORM_LABELS[company.legal_form]} на режиме {TAX_REGIME_LABELS[company.tax_regime]}.
        </Text>
      </Stack>

      {products.isPending && (
        <Stack gap="lg" aria-hidden>
          <Skeleton height={420} radius="lg" />
          <Skeleton height={420} radius="lg" />
        </Stack>
      )}

      {products.isError && (
        <ErrorState
          error={products.error}
          title="Не удалось загрузить продукты"
          onRetry={() => products.refetch()}
          retrying={products.isFetching}
        />
      )}

      {products.isSuccess && products.data.length === 0 && (
        <Text c="dimmed">Сейчас банк не принимает заявки. Загляните позже.</Text>
      )}

      {products.isSuccess && products.data.length > 0 && (
        <Stack gap="lg">
          {products.data.map((product) => (
            <ProductCard
              key={product.code}
              product={product}
              company={company}
              {...byProduct(product.code)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
