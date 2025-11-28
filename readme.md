# Сервис синхронизации тарифов Wildberries

## Стек

- Node.js 20
- TypeScript
- PostgreSQL 16
- Knex.js
- Google Sheets API
- Docker / Docker Compose

## Что нужно заранее

- Docker и Docker Compose
- Токен WB API
- Google Service Account с доступом к Google Sheets API и к нужным таблицам

### Переменные окружения

Заполните `.env`:

POSTGRES_PORT=5432
POSTGRES_DB=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

APP_PORT=5000

WBTOKEN=токен

GOOGLE_CREDENTIALS_PATH=./google-credentials.json
SPREADSHEET_IDS=id_таблицы_1,id_таблицы_2,id_таблицы_N

(Если не хочется хранить список таблиц в `.env`, можно добавлять их в БД в таблицу `spreadsheets`)

## Запуск

### Полный запуск (рекомендуется)

docker compose up --build

Эта команда поднимет всё в одном месте:

1. PostgreSQL
2. Приложение
3. Миграции
4. Планировщик (scheduler) для регулярных задач

### Остановка

docker compose down

### Полная очистка и перезапуск

Если нужно стартовать “с нуля”:

docker compose down --rmi local --volumes
docker compose up --build

## Как понять, что всё работает

### 1) Логи контейнера приложения


docker compose logs -f app

В здоровом сценарии там будут:

- успешный прогон миграций
- сообщения о старте scheduler
- сообщения о регулярной синхронизации тарифов
- сообщения об обновлении Google-таблиц

### 2) Проверка данных в PostgreSQL

Подключиться к БД:

docker exec -it postgres psql -U postgres -d postgres

Пара быстрых запросов для проверки:

SELECT COUNT(*) FROM wb_tariffs;
SELECT DISTINCT date FROM wb_tariffs ORDER BY date DESC;
SELECT * FROM wb_tariffs WHERE date = CURRENT_DATE ORDER BY coefficient ASC LIMIT 10;


### 3) Проверка в Google Sheets

Откройте таблицы и лист `stocks_coefs`. Данные должны быть записаны с заголовками и отсортированы по `coefficient` по возрастанию.

## Как это устроено внутри

### Синхронизация тарифов (каждый час)

Логика примерно такая:

1. Запрос к WB API
2. Из поля `boxDeliveryAndStorageExpr` вытаскивается коэффициент (парсинг формулы)
3. Данные сохраняются в таблицу за **текущую дату**
4. Дубликаты не размножаются — уникальность держится по комбинации: **дата + склад + формула**

### Обновление Google таблиц (каждый час, с задержкой 5 минут)

1. Берётся из БД актуальные данные (последнее состояние)
2. Сортируется по `coefficient` (по возрастанию)
3. Очищается лист `stocks_coefs` в каждой таблице
4. Записываются данные заново (с заголовками)

## База данных

### Таблица `wb_tariffs`

Поля:

- `id` — первичный ключ
- `date` — дата тарифа
- `warehouse_name` — название склада
- `box_delivery_and_storage_expr` — формула расчета
- `box_delivery_base` — базовая стоимость доставки
- `box_delivery_liter` — стоимость доставки за литр
- `box_storage_base` — базовая стоимость хранения
- `box_storage_liter` — стоимость хранения за литр
- `coefficient` — извлечённый коэффициент
- `created_at` — время создания
- `updated_at` — время обновления

Уникальный индекс: `(date, warehouse_name, box_delivery_and_storage_expr)`
