# Seed каталога

`salniki-products.json` содержит стартовые коллекции и товары для "Мир Сальников".

Первый безопасный путь импорта:

1. Запустить Vendure и открыть Admin UI.
2. Создать коллекции из блока `collections`.
3. Создать товары и варианты из блока `products`.
4. После импорта выполнить в backend "Свет":

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/admin/integrations/vendure/sync-products -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/admin/shop/search/reindex -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/admin/shop/rag/rebuild -Headers @{ "x-admin-key" = "<ADMIN_KEY>" }
```

Автоматический importer лучше добавить следующим этапом, когда будут утверждены финальные поля, цены и структура коллекций.

