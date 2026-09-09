# Деплой на корпоративный сервер

React-фронтенд + Node/Express-прокси к Jira API, всё работает одним
процессом: `server.js` отдаёт собранный `dist/` и обслуживает `/api/*`.

> В репозитории также есть `netlify.toml` и `netlify/functions/` — это для
> отдельного демо-окружения на Netlify, к деплою на свой сервер отношения
> не имеет, можно игнорировать.

## Требования

- Node.js 18+
- Доступ с сервера до Jira по 443

## Установка

```bash
git clone https://github.com/zloydivan19/Jira-dash.git
cd Jira-dash/jira-dashboard
npm install
npm run build      # dist/ не хранится в git, пересобирать при каждом обновлении
```

## Конфигурация

Единственная переменная — `PORT` (по умолчанию `3001`, можно любой). Задаётся
через процесс-менеджер (см. примеры ниже), отдельный `.env` на проде не нужен.

Jira-креды в окружении сервера не нужны — каждый пользователь вводит свои
URL/email/токен в UI, они уходят на сервер только в заголовках запроса и
нигде не сохраняются.

## Запуск

### systemd

`/etc/systemd/system/jira-dashboard.service`:

```ini
[Unit]
Description=Jira Dashboard
After=network.target

[Service]
Type=simple
User=jira-dashboard
WorkingDirectory=/opt/jira-dashboard/jira-dashboard
Environment=PORT=3001
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now jira-dashboard
```

### pm2

```bash
npm install -g pm2
PORT=3001 pm2 start server.js --name jira-dashboard
pm2 save && pm2 startup
```

## Reverse proxy / TLS

Процесс слушает голый HTTP, наружу не светить. Пример nginx:

```nginx
server {
    listen 443 ssl;
    server_name jira-dashboard.company.local;
    ssl_certificate     /etc/ssl/certs/company.crt;
    ssl_certificate_key /etc/ssl/private/company.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Обновление

```bash
cd Jira-dash/jira-dashboard
git pull
npm install
npm run build
sudo systemctl restart jira-dashboard   # или: pm2 restart jira-dashboard
```
