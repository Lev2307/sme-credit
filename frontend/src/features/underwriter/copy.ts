import type {
  ApplicationEvent,
  DecisionOutcomeEnum,
  EnrichmentResultStatusEnum,
  SourceEnum,
  UnderwriterDecisionOutcomeEnum,
} from '@/api/model';

// Тексты кабинета андеррайтера. Здесь можно больше подробностей, чем клиенту: это рабочий инструмент

// Почему заявка в очереди и на что смотрела модель
export const REASON_LABEL: Record<string, string> = {
  CLASS_C: 'Класс риска C',
  AMOUNT_ABOVE_AUTO_LIMIT: 'Сумма выше порога автоматического решения',
  SOURCE_UNAVAILABLE: 'Внешний источник не ответил',
  MASS_ADDRESS: 'Массовый адрес регистрации',
  INFO_REQUEST_LIMIT: 'Два раунда дозапроса без результата',
  CAP_RECENT_DELINQUENCY: 'Просрочки за последний год',
  CAP_TAX_DEBT: 'Налоговый долг больше 10% месячной выручки',
  UNDERWRITER_DECISION: 'Клиент ответил на дозапрос андеррайтера',
  REVENUE_MISMATCH: 'Выручка в анкете расходится с отчётностью',
  MISSING_DOCUMENTS: 'Не хватает документов',
  LOW_SCORE: 'Низкий балл',
  MAX_AMOUNT_BELOW_PRODUCT_MIN: 'Допустимая сумма ниже минимума продукта',
  STOP_FACTOR_LIQUIDATION: 'Ликвидация',
  STOP_FACTOR_BUSINESS_TOO_YOUNG: 'Бизнес моложе минимума продукта',
  STOP_FACTOR_DIRECTOR_DISQUALIFIED: 'Дисквалификация руководителя',
  STOP_FACTOR_CURRENT_DELINQUENCY: 'Текущая просрочка',
  LIMIT_PRODUCT_MAX: 'Максимум продукта',
  LIMIT_REVENUE_SHARE: 'Доля годовой выручки',
  LIMIT_DEBT_LOAD: 'Долговая нагрузка до 50%',
  LIMIT_COLLATERAL: 'Стоимость залога × LTV',
};

export const reasonLabel = (code: string) => REASON_LABEL[code] ?? code;

export const FACTOR_LABEL: Record<string, string> = {
  DEBT_LOAD: 'Долговая нагрузка с новым кредитом',
  CREDIT_HISTORY: 'Кредитная история',
  BUSINESS_AGE: 'Возраст бизнеса',
  TAX_DEBT: 'Налоговая задолженность',
  REQUEST_SHARE: 'Запрос к годовой выручке',
};

// Значения фактора кредитной истории приходят кодами
export const HISTORY_VALUE: Record<string, string> = {
  CLEAN: 'Без просрочек',
  NO_HISTORY: 'Истории нет',
  OLD_DELINQUENCY: 'Просрочки старше года',
  RECENT_DELINQUENCY: 'Просрочки за последний год',
};

export const OUTCOME_LABEL: Record<DecisionOutcomeEnum, string> = {
  APPROVE: 'Одобрение',
  COUNTER_OFFER: 'Контрпредложение',
  INFO_REQUEST: 'Дозапрос',
  UNDERWRITING: 'Андеррайтер',
  REJECT: 'Отказ',
};

export const DECISION_OPTIONS: { value: UnderwriterDecisionOutcomeEnum; label: string }[] = [
  { value: 'APPROVE', label: 'Одобрить' },
  { value: 'COUNTER_OFFER', label: 'Контрпредложение' },
  { value: 'INFO_REQUEST', label: 'Дозапрос' },
  { value: 'REJECT', label: 'Отказать' },
];

export const SOURCE_LABEL: Record<SourceEnum, string> = {
  EGRUL: 'ЕГРЮЛ/ЕГРИП',
  TB: '«Прозрачный бизнес» ФНС',
  BKI: 'Бюро кредитных историй',
};

export const SOURCE_STATUS_LABEL: Record<EnrichmentResultStatusEnum, string> = {
  OK: 'Ответил',
  NOT_FOUND: 'Не знает компанию',
  UNAVAILABLE: 'Не ответил',
};

export const UNDERWRITER_ACTORS: Record<ApplicationEvent['actor_type'], string> = {
  CLIENT: 'Клиент',
  SYSTEM: 'Система',
  UNDERWRITER: 'Андеррайтер',
};
