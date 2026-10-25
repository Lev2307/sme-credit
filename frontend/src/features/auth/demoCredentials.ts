// Тестовые учётки из backend/apps/core/management/commands/seed_demo.py.
// Подсказка для жюри: каждая учётка ведёт заявку в свой исход (mocks/README.md)
export type DemoAccount = {
  username: string;
  title: string;
  outcome: string;
  // ИНН тестовой компании этой учётки, подсказывается на шаге привязки компании
  inn?: string;
};

export const DEMO_PASSWORD = 'x123x';

export const DEMO_CLIENTS: DemoAccount[] = [
  {
    username: 'Reliable',
    title: 'ООО «Надёжная пекарня»',
    outcome: 'Одобрение',
    inn: '9901000010',
  },
  {
    username: 'Ambitious',
    title: 'ИП Дуров П. А.',
    outcome: 'Контрпредложение',
    inn: '990100000285',
  },
  {
    username: 'Inaccurate',
    title: 'ООО «Неточная отделка»',
    outcome: 'Дозапрос',
    inn: '9901000034',
  },
  {
    username: 'Borderline',
    title: 'ИП Светлов Н. О.',
    outcome: 'Андеррайтер',
    inn: '990100000422',
  },
  {
    username: 'Problematic',
    title: 'ООО «Проблемная логистика»',
    outcome: 'Отказ',
    inn: '9901000059',
  },
  {
    username: 'Capricious',
    title: 'ООО «Капризная мастерская»',
    outcome: 'БКИ не отвечает',
    inn: '9901000066',
  },
];

export const DEMO_UNDERWRITER: DemoAccount = {
  username: 'underWriter',
  title: 'Сотрудник банка',
  outcome: 'Очередь заявок',
};

export const demoInnFor = (username: string) =>
  DEMO_CLIENTS.find((account) => account.username === username)?.inn;
