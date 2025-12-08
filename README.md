# MTA Selected Transport Board

В этом репозитории — простое табло для MTA, которое работает через Cloudflare Pages + Functions.

## Настройка

- При деплое на Cloudflare Pages добавьте секрет/переменную окружения **MTA_API_KEY** в разделе **Settings → Functions**. Он будет автоматически проксирован в запросы к `bustime.mta.info`.
- По умолчанию фронтенд ходит к функции `/api/stop-monitoring` на том же домене; при необходимости URL можно поменять в настройках табло.
