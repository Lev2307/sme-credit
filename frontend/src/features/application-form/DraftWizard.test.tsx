import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ApplicationRetrieve,
  DocumentRequirement,
  PatchedApplicationPatch,
} from '@/api/model';
import { renderApp } from '@/test/render';
import { API, apiError, makeApplication, server, signedInAs } from '@/test/server';

const statement: DocumentRequirement = {
  doc_type: 'BANK_STATEMENT',
  name: 'Выписка по расчётному счёту за 12 месяцев',
  hint: 'Выгрузите в интернет-банке в PDF.',
  is_required: true,
};

// Маленький бэкенд в памяти: хранит черновик, принимает PATCH, файлы и отправку.
// У каждого теста свой id черновика: автосохранение прошлого теста, досланное при размонтировании,
// получит 404 и не испортит чужие данные
let draft: ApplicationRetrieve;
let patches: PatchedApplicationPatch[];
let uploads: { docType: string; name: string }[];

const backend = [
  http.get(`${API}/applications/:id`, ({ params }) =>
    params.id === draft.id ? HttpResponse.json(draft) : apiError(404, 'not_found', 'Не найдено'),
  ),
  http.patch(`${API}/applications/:id`, async ({ params, request }) => {
    if (params.id !== draft.id) return apiError(404, 'not_found', 'Не найдено');
    const patch = (await request.json()) as PatchedApplicationPatch;
    patches.push(patch);
    const { consent, ...fields } = patch;
    draft = {
      ...draft,
      ...(fields as Partial<ApplicationRetrieve>),
      ...(consent !== undefined && { consent_given_at: consent ? '2026-10-25T10:00:00Z' : null }),
    };
    return HttpResponse.json(draft);
  }),
  http.post(`${API}/applications/:id/documents`, async ({ params, request }) => {
    if (params.id !== draft.id) return apiError(404, 'not_found', 'Не найдено');
    // request.formData() в Node падает на File из jsdom, поэтому читаем multipart как текст
    const body = await request.text();
    const docType = /name="doc_type"\s+([A-Z_]+)/.exec(body)?.[1] ?? '';
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? '';
    uploads.push({ docType, name });
    const doc = {
      id: uploads.length,
      doc_type: docType as DocumentRequirement['doc_type'],
      original_name: name,
      size: 2048,
      uploaded_at: '2026-10-25T10:00:00Z',
    };
    draft = { ...draft, documents: [...draft.documents, doc] };
    return HttpResponse.json(doc, { status: 201 });
  }),
  http.delete(`${API}/applications/:id/documents/:docId`, ({ params }) => {
    draft = { ...draft, documents: draft.documents.filter((d) => String(d.id) !== params.docId) };
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${API}/applications/:id/submit`, () => {
    draft = { ...draft, status: 'IN_REVIEW', status_display: 'На проверке' };
    return HttpResponse.json(draft);
  }),
  http.get(`${API}/products/:code/documents`, () => HttpResponse.json([statement])),
];

const filledDraft = (overrides: Partial<ApplicationRetrieve> = {}) =>
  makeApplication({
    amount: '1500000.00',
    term_months: 24,
    purpose: 'Купить вторую печь',
    annual_revenue: '12000000.00',
    existing_monthly_payments: '0.00',
    ...overrides,
  });

const open = (application: ApplicationRetrieve) => {
  draft = application;
  server.use(signedInAs('Reliable'), ...backend);
  return renderApp(`/cabinet/applications/${application.id}`);
};

// Переход ждёт автосохранения, поэтому шагу даём больше времени появиться
const stepHeading = (name: string) =>
  screen.findByRole('heading', { level: 2, name }, { timeout: 3000 });

beforeEach(() => {
  patches = [];
  uploads = [];
});

describe('Анкета-мастер', () => {
  it('открывает черновик с сохранёнными значениями', async () => {
    open(filledDraft());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Экспресс-кредит' }),
    ).toBeInTheDocument();
    expect(await stepHeading('Сумма и срок')).toBeInTheDocument();
    expect(screen.getByLabelText(/Сумма кредита/)).toHaveValue('1 500 000 ₽');
    expect(screen.getByLabelText(/Срок, месяцев/)).toHaveValue('24');
    expect(screen.getByLabelText(/На что нужны деньги/)).toHaveValue('Купить вторую печь');
  });

  it('сохраняет правку сама и показывает, что сохранено', async () => {
    const { user } = open(makeApplication({}));

    await user.type(await screen.findByLabelText(/Сумма кредита/), '500000');

    expect(await screen.findByText(/Сохранено в/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(patches.at(-1)).toMatchObject({ amount: '500000.00' });
    // В PATCH только то, что изменилось
    expect(Object.keys(patches.at(-1)!)).toEqual(['amount']);
  });

  it('не пускает дальше с пустыми или неподходящими полями', async () => {
    const { user } = open(makeApplication({}));

    await user.type(await screen.findByLabelText(/Сумма кредита/), '50000000');
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    expect(
      await screen.findByText(/Для этого продукта сумма от 100\s000\s₽ до 3\s000\s000\s₽/),
    ).toBeInTheDocument();
    expect(screen.getByText('Укажите срок кредита')).toBeInTheDocument();
    expect(screen.getByText('Опишите, на что нужны деньги')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Сумма и срок' })).toBeInTheDocument();
  });

  it('шаг залога есть только у продукта с залогом', async () => {
    const { user } = open(filledDraft({ product: 'INVEST', amount: '5000000.00' }));

    await user.click(await screen.findByRole('button', { name: 'Далее' }));
    await stepHeading('Финансы');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await stepHeading('Залог');

    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(await screen.findByText('Укажите вид залога')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Стоимость залога/), '6000000');
    await user.tab();
    expect(
      await screen.findByText(/Под такой залог дадут не больше 4\s200\s000\s₽/),
    ).toBeInTheDocument();
  });

  it('загружает документ как файл и не пускает неподходящий формат', async () => {
    const { user } = open(filledDraft());

    await user.click(await screen.findByRole('button', { name: 'Документы' }));
    await stepHeading('Документы');
    expect(screen.getByText(/Загружено 0 из 1 обязательных/)).toBeInTheDocument();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    // Расширение не то, хотя тип выдаёт себя за PDF: браузерный фильтр пропустит, мы нет
    await user.upload(input, new File(['hello'], 'report.docx', { type: 'application/pdf' }));
    expect(await screen.findByText('Подойдёт только PDF, JPG или PNG')).toBeInTheDocument();
    expect(uploads).toHaveLength(0);

    await user.upload(input, new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' }));

    expect(await screen.findByText('statement.pdf')).toBeInTheDocument();
    expect(uploads).toEqual([{ docType: 'BANK_STATEMENT', name: 'statement.pdf' }]);
    expect(screen.getByText(/Загружено 1 из 1 обязательных/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить файл statement.pdf' }));
    await waitFor(() => expect(screen.queryByText('statement.pdf')).not.toBeInTheDocument());
  });

  it('на проверке показывает, что осталось, и ведёт к нужному шагу', async () => {
    const { user } = open(filledDraft());

    await user.click(await screen.findByRole('button', { name: 'Проверка' }));
    await stepHeading('Проверка');

    const left = await screen.findByText('Перед отправкой осталось');
    const list = within(left.closest('section')!);
    expect(list.getByText(/Без согласия банк не вправе/)).toBeInTheDocument();
    expect(list.getByText(/Загрузите документ: Выписка/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить заявку' })).toBeDisabled();

    await user.click(list.getByRole('button', { name: 'Исправить' }));
    expect(await stepHeading('Документы')).toBeInTheDocument();
  });

  it('отправляет заполненную заявку и показывает её статус', async () => {
    const { user } = open(
      filledDraft({
        documents: [
          {
            id: 9,
            doc_type: 'BANK_STATEMENT',
            original_name: 'statement.pdf',
            size: 2048,
            uploaded_at: '2026-10-25T10:00:00Z',
          },
        ],
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Проверка' }));
    await user.click(await screen.findByRole('checkbox', { name: /Согласен на запрос/ }));
    expect(await screen.findByText('Всё готово к отправке')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отправить заявку' }));

    expect(await screen.findByText('На проверке')).toBeInTheDocument();
    expect(patches.some((p) => p.consent === true)).toBe(true);
  });

  it('показывает, что не устроило сервер при отправке', async () => {
    const { user } = open(
      filledDraft({
        consent_given_at: '2026-10-25T10:00:00Z',
        documents: [
          {
            id: 9,
            doc_type: 'BANK_STATEMENT',
            original_name: 'statement.pdf',
            size: 2048,
            uploaded_at: '2026-10-25T10:00:00Z',
          },
        ],
      }),
    );
    server.use(
      http.post(`${API}/applications/:id/submit`, () =>
        HttpResponse.json(
          {
            code: 'validation_error',
            message: 'Загрузите декларацию',
            details: {
              missing_documents: [{ doc_type: 'USN_RETURN', name: 'Декларация по УСН' }],
            },
          },
          { status: 400 },
        ),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Проверка' }));
    await user.click(await screen.findByRole('button', { name: 'Отправить заявку' }));

    expect(await screen.findByText('Загрузите документ: Декларация по УСН')).toBeInTheDocument();
  });

  it('несуществующую заявку называет не найденной', async () => {
    draft = filledDraft();
    server.use(signedInAs('Reliable'), ...backend);
    renderApp('/cabinet/applications/unknown');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Заявка не найдена' }),
    ).toBeInTheDocument();
  });
});
