# pg_to_bq_ts

This project allows you to copy tables from a PostgreSQL database to BigQuery using TypeScript and Docker.

## Prerequisites
- Node.js
- Docker
- A Google Cloud account with a BigQuery service account

---

## 1. How to get the required configuration information

### PostgreSQL Information
- **PG_HOST**: Address of the PostgreSQL server (e.g., `localhost` or the IP/hostname of a remote server).
- **PG_PORT**: PostgreSQL listening port (default: `5432`).
- **PG_USER** and **PG_PASSWORD**: Credentials for a user with read access to the tables to migrate (ask your database administrator or create a dedicated user).
- **PG_DATABASE**: Name of the source database.

### BigQuery Information
- **GOOGLE_APPLICATION_CREDENTIALS**: Absolute path to the Google Cloud service account JSON file with write permissions on BigQuery.
  - To obtain it:
    1. Go to the [Google Cloud IAM & Admin > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) page.
    2. Create a new service account or select an existing one.
    3. Grant it the `BigQuery Data Editor` role (or equivalent).
    4. Generate a JSON key and download it.
    5. Place this file on your machine and set its absolute path in the variable.
- **BQ_PROJECT_ID**: Your Google Cloud project ID (visible in the GCP console, top left).
- **BQ_DATASET**: Name of the target BigQuery dataset (must exist or be created in the BigQuery console).

### Tables to Migrate
- **TABLES**: Comma-separated list of tables to synchronize (e.g., `users,orders,products`). The tables must exist in the source PostgreSQL database.

### Other Options
- **FETCH_ALL_ROWS**:
  - If `true`: all rows from each table will be synchronized on every run (ignores sync history).
  - If `false` (recommended): only new rows since the last sync (tracked in `sync_state.json`) will be transferred, if the table has a `created_at` column.
  - Default: `false`.

---

## 2. BigQuery Table Creation
- **Automatic creation**: If the table does not exist in BigQuery, the script will create it automatically with a schema based on the first data row.
- **Manual creation (optional)**: You can create the dataset and tables in advance via the BigQuery console if you want precise control over the schema.

---

## 3. Example `.env` file

```env
# PostgreSQL configuration
PG_HOST=localhost
PG_PORT=5432
PG_USER=your_pg_user
PG_PASSWORD=your_pg_password
PG_DATABASE=your_pg_database

# BigQuery configuration
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/bq-service-account.json
BQ_PROJECT_ID=your_bq_project_id
BQ_DATASET=your_bq_dataset

# Tables to migrate (comma separated)
TABLES=table1,table2

# Synchronization mode
FETCH_ALL_ROWS=false
```

---

## 4. Steps Summary
1. Create a Google Cloud service account with BigQuery permissions and download the JSON key.
2. Create (or identify) the target BigQuery dataset.
3. Obtain PostgreSQL access credentials.
4. Fill in the `.env` file with the above information.
5. Run the script locally or with Docker.

---

## 5. What is `sync_state.json` for?

This file is used to store the last synchronization date for each migrated table.

- On each run, the script records the last synced date for each table.
- This allows only new data to be synchronized on subsequent runs (if the table has a `created_at` column).
- If the file is deleted or empty, a full sync will be performed.

**Note:** This file is managed automatically by the script; you do not need to edit it manually.

---

## Usage

### Locally
```bash
npm install
npx ts-node src/index.ts
```

### With Docker
```bash
docker build -t pg_to_bq_ts .
docker run --env-file .env -v /path/to/credentials.json:/path/to/your/bq-service-account.json pg_to_bq_ts
```

### With Docker Compose
You can use the provided `docker-compose-example.yml` as a template for your deployment.