// Статусы, в которых CR считается «на оценке»: таймер SLA идёт, задача видна в «Контроле оценки»,
// в TTM время в них идёт в фазу 1. Product Feature — проработка продактом после модерации, это тоже оценка.
// Имена в нижнем регистре — так их нормализует разбор changelog.
export const EVAL_ACTIVE_STATUSES = ['awaiting moderation', 'на оценку', 'уточнение требований', 'product feature'];

export const EVAL_ACTIVE_STATUSES_JQL = '"Awaiting Moderation", "На оценку", "Уточнение требований", "Product Feature"';
