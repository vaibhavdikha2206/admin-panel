# Conversation collections

Connect: `mongodb+srv://<user>:<password>@cluster0.wsqndf2.mongodb.net/`, database = `MONGODB_DATABASE` in `.env`.

## conversation_messages
One doc per exchange. Deleted after 7 days (`MESSAGE_RETENTION_DAYS`).

| Field | Type | Note |
|---|---|---|
| storeId, customerId | string | |
| message | string | customer's text |
| response | string | bot's reply |
| messageId | string \| null | WhatsApp id, unique per store |
| customerName | string \| null | |
| metadata | object | e.g. `{ intent }` |
| createdAt | date | message time |
| storedAt | date | insert time |

## conversation_customers
One doc per `(storeId, customerId)`. Updated on every message, never expires.

| Field | Type |
|---|---|
| storeId, customerId | string |
| customerName | string \| null |
| firstMessageAt, lastMessageAt | date |
| messageCount | number |
