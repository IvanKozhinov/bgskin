// Policy documents (Terms, Privacy, Refund, AML) — editable in the admin panel,
// shown in the footer and as an FAQ/rules page. Default templates are seeded on
// first use so payment-provider onboarding has the required pages from day one.

import {
  countPolicies,
  deletePolicyRow,
  getPolicyRow,
  listPoliciesRows,
  upsertPolicyRow,
} from "./db";
import type { Policy } from "./types";

const DEFAULTS: Omit<Policy, "updatedAt">[] = [
  {
    slug: "terms",
    title: "Пользовательское соглашение",
    published: true,
    showInFaq: true,
    sortOrder: 10,
    bodyMd: `## 1. Общие положения
Настоящее Соглашение регулирует использование сервиса BGASkins.cc (далее — «Сервис»), предоставляющего возможность покупки внутриигровых предметов Counter-Strike 2 с доставкой через систему обмена Steam.

## 2. Регистрация
Доступ к покупкам осуществляется через авторизацию Steam (OpenID). Пользователь обязуется указывать корректную трейд-ссылку для получения предметов.

## 3. Покупка и доставка
Предмет закупается в момент оформления заказа и отправляется трейд-оффером на указанную трейд-ссылку. Ориентировочное время доставки — до 15 минут.

## 4. Ответственность
Сервис не аффилирован с Valve Corporation. Counter-Strike 2 является товарным знаком Valve Corporation.`,
  },
  {
    slug: "privacy",
    title: "Политика конфиденциальности",
    published: true,
    showInFaq: true,
    sortOrder: 20,
    bodyMd: `## Какие данные мы обрабатываем
- Идентификатор Steam (SteamID64), ник и аватар — для авторизации и отображения профиля.
- Трейд-ссылка — для доставки предметов.
- IP-адрес и страна — для безопасности и предотвращения мошенничества.
- История заказов и платежей.

## Как мы используем данные
Данные используются исключительно для оказания услуги, обеспечения безопасности и выполнения требований платёжных систем.

## Хранение и передача
Мы не передаём персональные данные третьим лицам, кроме платёжных провайдеров и системы Steam в объёме, необходимом для проведения операции.`,
  },
  {
    slug: "refund",
    title: "Политика возврата",
    published: true,
    showInFaq: true,
    sortOrder: 30,
    bodyMd: `## Возврат средств
Если трейд-оффер не удалось отправить или он был отменён по причинам на стороне Сервиса, средства автоматически возвращаются на внутренний баланс.

## Невозвратные случаи
После успешного получения предмета в инвентарь Steam операция считается завершённой и возврату не подлежит.

## Спорные ситуации
Спорные случаи рассматриваются поддержкой в течение 72 часов с момента обращения.`,
  },
  {
    slug: "aml",
    title: "AML / KYC политика",
    published: true,
    showInFaq: false,
    sortOrder: 40,
    bodyMd: `## Противодействие отмыванию средств
Сервис вправе запросить дополнительную верификацию личности при подозрительной активности или по требованию платёжного провайдера.

## Ограничения
Мы оставляем за собой право отказать в обслуживании и заморозить операцию при выявлении признаков мошенничества или нарушения законодательства.`,
  },
];

function seedIfEmpty(): void {
  if (countPolicies() > 0) return;
  for (const p of DEFAULTS) {
    upsertPolicyRow({
      slug: p.slug,
      title: p.title,
      bodyMd: p.bodyMd,
      published: p.published,
      showInFaq: p.showInFaq,
      sortOrder: p.sortOrder,
    });
  }
}

export function listPolicies(includeUnpublished = false): Policy[] {
  seedIfEmpty();
  return listPoliciesRows(includeUnpublished);
}

export function getPolicy(slug: string): Policy | null {
  seedIfEmpty();
  return getPolicyRow(slug);
}

/** Published policies for the footer. */
export function footerPolicies(): Policy[] {
  return listPolicies(false);
}

/** Published + FAQ-flagged policies for the top-of-site FAQ page. */
export function faqPolicies(): Policy[] {
  return listPolicies(false).filter((p) => p.showInFaq);
}

export function savePolicy(p: {
  slug: string;
  title: string;
  bodyMd: string;
  published: boolean;
  showInFaq: boolean;
  sortOrder: number;
}): void {
  upsertPolicyRow(p);
}

export function removePolicy(slug: string): void {
  deletePolicyRow(slug);
}
