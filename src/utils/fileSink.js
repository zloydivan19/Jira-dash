// Куда уходит готовый файл выгрузки. По умолчанию скачивается на компьютер; на время
// «Сохранить на Яндекс Диск» подменяется, и тот же файл уходит в окно сохранения на Диск.

let sink = null;

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const sinkActive = () => !!sink;

export function saveFile(blob, filename) {
  if (sink) return sink(blob, filename);
  downloadBlob(blob, filename);
  return Promise.resolve();
}

// Выполнить экспорт так, чтобы его файл попал в sinkFn вместо скачивания.
export async function withFileSink(exportFn, sinkFn) {
  const pending = [];
  sink = (blob, filename) => { const p = Promise.resolve(sinkFn(blob, filename)); pending.push(p); return p; };
  try {
    await exportFn();
  } finally {
    sink = null;
  }
  await Promise.all(pending);
  return pending.length > 0;
}
