import axios from 'axios';

// Карточки версий Jira (релизов): название, описание, даты старта и выпуска, выпущена ли.
// В полях задачи (fixVersions) даты старта нет, поэтому берём карточки по номерам версий.
// Используется и Express-сервером, и функцией Netlify. Возвращает { status, data }.
export async function jiraVersions({ url, auth }, idsParam) {
  const ids = [...new Set(String(idsParam || '').split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s)))].slice(0, 60);
  if (!ids.length) return { status: 200, data: { versions: {} } };
  const versions = {};
  const queue = [...ids];
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        const r = await axios.get(`${url}/rest/api/3/version/${id}`, { headers: { Authorization: auth, Accept: 'application/json' }, timeout: 15000 });
        const v = r.data || {};
        versions[id] = {
          id: v.id, name: v.name, description: v.description || '',
          startDate: v.startDate || null, releaseDate: v.releaseDate || null,
          released: !!v.released, archived: !!v.archived, projectId: v.projectId || null,
        };
      } catch { /* нет доступа к версии — покажем только то, что есть в задаче */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker));
  return { status: 200, data: { versions } };
}
