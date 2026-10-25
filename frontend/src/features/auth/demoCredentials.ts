// Тестовые учётки из backend/apps/core/management/commands/seed_demo.py.
// Подсказка для жюри: каждая учётка ведёт заявку в свой исход (mocks/README.md)
export type DemoAccount = {
  username: string;
  title: string;
  outcome: string;
};

export const DEMO_PASSWORD = 'x123x';

export const DEMO_CLIENTS: DemoAccount[] = [
  { username: 'Reliable', title: 'ООО «Надёжная пекарня»', outcome: 'Одобрение' },
  { username: 'Ambitious', title: 'ИП Дуров П. А.', outcome: 'Контрпредложение' },
  { username: 'Inaccurate', title: 'ООО «Неточная отделка»', outcome: 'Дозапрос' },
  { username: 'Borderline', title: 'ИП Светлов Н. О.', outcome: 'Андеррайтер' },
  { username: 'Problematic', title: 'ООО «Проблемная логистика»', outcome: 'Отказ' },
  { username: 'Capricious', title: 'ООО «Капризная мастерская»', outcome: 'БКИ не отвечает' },
];

export const DEMO_UNDERWRITER: DemoAccount = {
  username: 'underWriter',
  title: 'Сотрудник банка',
  outcome: 'Очередь заявок',
};
