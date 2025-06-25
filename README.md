# pg_to_bq_ts

Ce projet permet de copier des tables d'une base PostgreSQL vers BigQuery en utilisant TypeScript et Docker.

## Prérequis
- Node.js
- Docker
- Un compte Google Cloud avec un service account BigQuery

## Configuration
1. Copier le fichier `.env` et remplir les variables nécessaires.
2. Placer le fichier de credentials Google dans le chemin indiqué par `GOOGLE_APPLICATION_CREDENTIALS`.

## Utilisation

### En local
```bash
npm install
npx ts-node src/index.ts
```

### Avec Docker
```bash
docker build -t pg_to_bq_ts .
docker run --env-file .env -v /chemin/vers/credentials.json:/path/to/your/bq-service-account.json pg_to_bq_ts
```