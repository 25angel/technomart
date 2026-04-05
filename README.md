# TechnoMart

Минимальный full-stack интернет-магазин:
- frontend в `public/`
- backend на Node.js в `server.js`
- сырые импорты в `data/raw/dummyjson/`
- нормализованные товары в `data/processed/products.json`
- заказы сохраняются в `data/orders.json`

## Запуск

```bash
npm start
```

После запуска открой:

```text
http://localhost:3000
```

## API

- `GET /api/health`
- `GET /api/store`
- `POST /api/orders`
- `POST /api/chat`

## Импортный пайплайн

1. Импорт DummyJSON каталога:

```bash
npm run import:dummyjson
```

2. Нормализация:

```bash
npm run normalize:products
```

3. Локальная загрузка изображений при необходимости:

```bash
npm run images:products
```

Для DummyJSON это обычно не требуется, потому что продукты уже приходят с рабочими публичными `images`.

Полный цикл обновления каталога:

```bash
npm run import:dummyjson
npm run normalize:products
```

## Vercel

Проект готов к деплою на Vercel.

1. Импортируй репозиторий в Vercel.
2. В `Environment Variables` добавь:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL=gemini-2.5-flash`
3. Deploy.

Локально структура уже совместима с Vercel через [vercel.json](/Users/skyapathy/e-commerce_technomart/vercel.json).

Важно: `data/orders.json` на Vercel не является надежным постоянным хранилищем. Для демо это ок, но для реального продакшна заказы нужно вынести в БД.

## Что уже реализовано

- загрузка каталога с backend
- фильтры, поиск и сортировка
- корзина и wishlist с сохранением в `localStorage`
- checkout с валидацией
- создание заказа на backend
- серверный пересчет totals и promo
- сохранение заказов в JSON
- слой `raw -> processed -> app data`
- локальные плейсхолдеры вместо эмодзи у товаров
# technomart
