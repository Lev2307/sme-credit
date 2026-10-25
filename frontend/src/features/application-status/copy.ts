import type { ApplicationEvent, ApplicationStatusEnum, DocTypeEnum } from '@/api/model';

// Тексты для клиента: что происходит с заявкой, сколько ждать и что делать.
// Коды бэкенда (статусы, действия журнала, причины) переводим здесь, в интерфейс они не попадают

type StatusCopy = {
  title: string;
  text: string;
  wait?: string;
  // Одна строка для списка заявок: что сейчас происходит или что сделать
  hint: string;
  // Подпись главной кнопки на карточке заявки, если ход за клиентом
  action?: string;
};

export const STATUS_COPY: Record<ApplicationStatusEnum, StatusCopy> = {
  DRAFT: {
    title: 'Черновик',
    text: 'Заполните анкету и приложите документы. Всё сохраняется само, можно вернуться в любой момент.',
    hint: 'Анкета не дозаполнена',
    action: 'Продолжить анкету',
  },
  IN_REVIEW: {
    title: 'Проверяем вашу заявку',
    text: 'Сверяем данные с реестрами и бюро кредитных историй. От вас сейчас ничего не нужно.',
    wait: 'Обычно это пара минут',
    hint: 'Проверяем, это пара минут',
  },
  UNDERWRITING: {
    title: 'Заявку смотрит специалист банка',
    text: 'Автоматически решить не получилось, поэтому заявку разбирает человек. Если ему что-то понадобится, вопрос появится здесь.',
    wait: 'Обычно до одного рабочего дня',
    hint: 'Смотрит специалист банка',
  },
  INFO_REQUESTED: {
    title: 'Нужно кое-что уточнить',
    text: 'Ответьте на вопрос банка ниже, и проверка продолжится.',
    hint: 'Банк задал вопрос',
    action: 'Ответить банку',
  },
  APPROVED: {
    title: 'Кредит одобрен',
    text: 'Посмотрите условия и решите, подходят ли они вам.',
    hint: 'Одобрено, посмотрите условия',
    action: 'Посмотреть условия',
  },
  COUNTER_OFFER: {
    title: 'Есть встречное предложение',
    text: 'Всю сумму банк дать не готов, но предлагает другие условия. Сравните их с заявкой.',
    hint: 'Банк предлагает другие условия',
    action: 'Сравнить условия',
  },
  AWAITING_SIGNATURE: {
    title: 'Осталось подписать договор',
    text: 'Проверьте итоговые условия и подпишите договор прямо здесь.',
    hint: 'Ждёт вашей подписи',
    action: 'Подписать договор',
  },
  DISBURSING: {
    title: 'Деньги уже в пути',
    text: 'Договор подписан, банк переводит деньги на счёт компании.',
    wait: 'Обычно несколько минут',
    hint: 'Переводим деньги',
  },
  DISBURSED: {
    title: 'Деньги на счёте',
    text: 'Кредит выдан. Условия и номер договора ниже.',
    hint: 'Кредит выдан',
  },
  REJECTED: {
    title: 'В этот раз не получилось',
    text: 'Можно подать новую заявку, когда причина будет устранена, или выбрать другой продукт.',
    hint: 'Банк отказал',
  },
  CANCELLED: {
    title: 'Заявка отменена',
    text: 'Её уже не продолжить, но новую можно подать в любой момент.',
    hint: 'Отменена',
  },
};

// Этапы пути клиента для шкалы прогресса (docs/02-process.md, «Этапы»)
export const JOURNEY = ['Подача', 'Проверка', 'Решение', 'Подписание', 'Выдача'] as const;

export const journeyStep = (status: ApplicationStatusEnum): number => {
  switch (status) {
    case 'DRAFT':
      return 0;
    case 'IN_REVIEW':
    case 'UNDERWRITING':
    case 'INFO_REQUESTED':
      return 1;
    case 'APPROVED':
    case 'COUNTER_OFFER':
    case 'REJECTED':
      return 2;
    case 'AWAITING_SIGNATURE':
      return 3;
    case 'DISBURSING':
      return 4;
    case 'DISBURSED':
      return 5;
    case 'CANCELLED':
      return 0;
  }
};

// Причины решения, которые можно показать клиенту простыми словами. Остальные коды внутренние
export const REASON_TEXT: Record<string, string> = {
  STOP_FACTOR_LIQUIDATION: 'По данным ЕГРЮЛ компания ликвидируется или ликвидирована',
  STOP_FACTOR_BUSINESS_TOO_YOUNG: 'Бизнес работает меньше, чем требует продукт',
  STOP_FACTOR_DIRECTOR_DISQUALIFIED: 'Руководитель компании дисквалифицирован',
  STOP_FACTOR_CURRENT_DELINQUENCY: 'По данным бюро кредитных историй есть текущая просрочка',
  LOW_SCORE: 'Оценка риска по заявке ниже порога банка',
  MAX_AMOUNT_BELOW_PRODUCT_MIN:
    'Сумма, которую банк готов выдать, меньше минимальной для этого продукта',
  SOURCE_UNAVAILABLE: 'Один из источников данных не ответил, поэтому заявку проверит специалист',
  REVENUE_MISMATCH: 'Выручка в анкете заметно отличается от данных налоговой',
  MISSING_DOCUMENTS: 'Не хватает документов',
  CLIENT_CANCELLED: 'Вы отменили заявку',
  CLIENT_DECLINED_OFFER: 'Вы отказались от предложения банка',
};

const EVENT_TITLE: Record<string, string> = {
  SUBMITTED: 'Заявка отправлена',
  ENRICHED: 'Собрали данные из реестров и бюро кредитных историй',
  SCORED: 'Рассчитали оценку риска',
  TAKEN: 'Специалист банка взял заявку в работу',
  INFO_ANSWERED: 'Вы ответили на вопрос банка',
  OFFER_ACCEPTED: 'Вы приняли предложение',
  OFFER_DECLINED: 'Вы отказались от предложения',
  OFFER_SIGNED: 'Договор подписан',
  DISBURSED: 'Деньги зачислены',
  CANCELLED: 'Заявка отменена',
};

const DECISION_TITLE: Partial<Record<ApplicationStatusEnum, string>> = {
  UNDERWRITING: 'Заявку передали специалисту банка',
  INFO_REQUESTED: 'Банк попросил уточнить данные',
  APPROVED: 'Заявка одобрена',
  COUNTER_OFFER: 'Банк предложил другие условия',
  REJECTED: 'Банк не одобрил заявку',
};

export const eventTitle = (event: ApplicationEvent) => {
  if (event.action === 'DECIDED' || event.action === 'UNDERWRITER_DECIDED') {
    return DECISION_TITLE[event.to_status] ?? `Решение: ${event.to_status_display}`;
  }
  return EVENT_TITLE[event.action] ?? (event.to_status_display || 'Обновление заявки');
};

export const ACTOR_LABEL: Record<ApplicationEvent['actor_type'], string> = {
  CLIENT: 'Вы',
  SYSTEM: 'Система',
  UNDERWRITER: 'Специалист банка',
};

// Подписи документов, если требования продукта ещё не загрузились
export const DOC_TYPE_LABELS: Record<DocTypeEnum, string> = {
  BANK_STATEMENT: 'Выписка по расчётному счёту',
  FINANCIAL_STATEMENTS: 'Бухгалтерская отчётность',
  VAT_RETURN: 'Декларация по НДС',
  NDFL_RETURN: 'Декларация 3-НДФЛ',
  USN_RETURN: 'Декларация по УСН',
  ESHN_RETURN: 'Декларация по ЕСХН',
  PATENT: 'Патент и книга учёта доходов',
  PURCHASE_CONTRACT: 'Договор или счёт на покупку',
  COLLATERAL_DOCS: 'Документы на залог и его оценка',
};

// Отменить можно в любом статусе до подписания (docs/02-process.md)
export const canCancel = (status: ApplicationStatusEnum) =>
  !['DISBURSING', 'DISBURSED', 'REJECTED', 'CANCELLED'].includes(status);
