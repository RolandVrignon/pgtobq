import { Client } from "pg";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const SYNC_STATE_FILE = "/usr/src/app/sync_state.json";

// Load environment variables
const {
  PG_HOST,
  PG_PORT,
  PG_USER,
  PG_PASSWORD,
  PG_DATABASE,
  TABLES,
  GOOGLE_APPLICATION_CREDENTIALS,
  BQ_PROJECT_ID,
  BQ_DATASET,
} = process.env;

const fetchAllRows = process.env.FETCH_ALL_ROWS === "true";

if (
  !PG_HOST ||
  !PG_PORT ||
  !PG_USER ||
  !PG_PASSWORD ||
  !PG_DATABASE ||
  !TABLES ||
  !GOOGLE_APPLICATION_CREDENTIALS ||
  !BQ_PROJECT_ID ||
  !BQ_DATASET
) {
  console.error(
    "Missing PostgreSQL or BigQuery configuration in environment variables."
  );
  process.exit(1);
}

// Initialize PostgreSQL client
const pgClient = new Client({
  host: PG_HOST,
  port: parseInt(PG_PORT, 10),
  user: PG_USER,
  password: PG_PASSWORD,
  database: PG_DATABASE,
  ssl: { rejectUnauthorized: false },
});

// Initialize BigQuery client
const bqClient = new BigQuery({
  projectId: BQ_PROJECT_ID,
  keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
});

// Function to clean data before insertion
function cleanRowForBigQuery(row: any): any {
  const cleanedRow: any = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      cleanedRow[key] = null;
    } else if (value instanceof Date) {
      // Handle Date objects specifically
      cleanedRow[key] = value.toISOString();
    } else if (typeof value === "object") {
      // Convert objects/arrays to JSON strings
      cleanedRow[key] = JSON.stringify(value);
    } else if (typeof value === "string") {
      // Truncate long strings and handle special characters
      cleanedRow[key] = value.length > 1024 ? value.substring(0, 1024) : value;
    } else {
      // Convert everything else to string
      cleanedRow[key] = String(value);
    }
  }
  return cleanedRow;
}

async function insertIntoBigQuery(table: string, rows: any[]) {
  try {
    const dataset = bqClient.dataset(BQ_DATASET!);
    const bqTable = dataset.table(table);

      // Ajoutez les logs ici AVANT les traitements
      if (rows.length > 0) {
        console.log("First row to be inserted:", JSON.stringify(rows[0], null, 2));
        console.log("Cleaned first row:", JSON.stringify(cleanRowForBigQuery(rows[0]), null, 2));
      } else {
        console.log("No rows to insert");
      }

    // Create table if not exists (schema auto-detected from first row)
    if (!(await bqTable.exists())[0]) {
      if (rows.length === 0) {
        console.log(`No data to create table ${table} in BigQuery.`);
        return;
      }
      // Clean first row for schema inference
      const cleanedFirstRow = cleanRowForBigQuery(rows[0]);
      const schema = Object.keys(cleanedFirstRow).map((field) => ({
        name: field,
        type: "STRING",
      }));
      await bqTable.create({ schema });
      console.log(`Created table ${table} in BigQuery.`);

      // Wait for the table to be available
      let retries = 5;
      while (retries > 0) {
        try {
          const [exists] = await bqTable.exists();
          if (exists) {
            console.log(`Table ${table} is now available.`);
            break;
          }
        } catch (err) {
          console.log(
            `Waiting for table ${table} to be available... (retries left: ${retries})`
          );
        }
        await new Promise((res) => setTimeout(res, 2000)); // wait 2 seconds
        retries--;
      }

      if (retries === 0) {
        throw new Error(`Table ${table} is still not available after waiting.`);
      }
    }

    // Insert rows in batches
    const BATCH_SIZE = 100; // Reduce batch size for better error handling
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const cleanedBatch = batch.map((row) => cleanRowForBigQuery(row));

      try {
        await bqTable.insert(cleanedBatch);
        console.log(
          `Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${
            batch.length
          } rows) into BigQuery table ${table}`
        );
      } catch (batchError: any) {
        console.error(
          `Error inserting batch ${
            Math.floor(i / BATCH_SIZE) + 1
          } for table ${table}:`
        );

        // Log l'erreur complète d'abord
        console.error("Full error object:", JSON.stringify(batchError, null, 2));

        // Log specific errors for debugging
        if (batchError.errors && batchError.errors.length > 0) {
          console.error(
            `First few errors:`,
            batchError.errors.slice(0, 3).map((err: any) => ({
              errors: err.errors,
              row: err.row,
            }))
          );
        } else {
          console.error("No detailed errors available in batchError.errors");
        }

        // Continue with next batch instead of failing completely
        console.log(`Skipping failed batch and continuing...`);
      }
    }
  } catch (error) {
    console.error(`Error processing table ${table}:`, error);
    throw error; // Re-throw to let the main function handle it
  }
}

async function fetchTables() {
  try {
    // Connect to PostgreSQL
    await pgClient.connect();
    console.log("Connected to PostgreSQL");

    // Load last sync state
    const syncState = loadSyncState();
    console.log("syncState:", syncState);

    // Split tables by comma and trim spaces
    const tables = TABLES!.split(",").map((t) => t.trim());
    for (const table of tables) {
      const lastSyncTime = syncState[table] || null;
      console.log("table:", table);
      console.log("lastSyncTime:", lastSyncTime);

      // Capture timestamp BEFORE the query to avoid missing records created during processing
      console.log("capturing current timestamp for next sync");
      const currentTimestamp = await getCurrentPgTimestamp();
      console.log("captured currentTimestamp:", currentTimestamp);

      let query;
      let queryParams: any[] = [];

      console.log("fetchAllRows:", fetchAllRows);
      const hasCreatedAt = await hasCreatedAtColumn(table);

      if (lastSyncTime && !fetchAllRows && hasCreatedAt) {
        console.log("fetching rows that have been created since last sync");
        // Only fetch rows that have been created since last sync
        // Use PostgreSQL timestamp comparison to avoid timezone issues
        query = `SELECT * FROM "${table}" WHERE "created_at" > $1::timestamp ORDER BY "created_at" ASC`;
        queryParams = [lastSyncTime];
        const res = await pgClient.query(query, queryParams);
        console.log(
          `Fetched ${
            res.rowCount || 0
          } new rows from table ${table} since ${lastSyncTime}`
        );

        if ((res.rowCount || 0) > 0) {
          await insertIntoBigQuery(table, res.rows);
        } else {
          console.log(`No new data to sync for table ${table}`);
        }
      } else {
        console.log("fetching all rows");
        // First time sync or no created_at column: fetch all rows
        if (!hasCreatedAt) {
          console.log(`Warning: Table ${table} does not have created_at column. Future syncs will always fetch all rows.`);
        }
        query = `SELECT * FROM "${table}"`
        const res = await pgClient.query(query);
        console.log(
          `Fetched ${res.rowCount || 0} rows from table ${table} (initial sync)`
        );

        if ((res.rowCount || 0) > 0) {
          await insertIntoBigQuery(table, res.rows);
        }
      }

      // Update sync state with the timestamp captured BEFORE the query (only if table has created_at)
      if (hasCreatedAt) {
        console.log("updating sync state with captured timestamp");
        syncState[table] = currentTimestamp;
      } else {
        console.log(`Skipping sync state update for table ${table} (no created_at column)`);
      }
    }

    // Save sync state
    saveSyncState(syncState);
  } catch (err) {
    console.error("Error fetching tables:", err);
  } finally {
    await pgClient.end();
    console.log("PostgreSQL connection closed");
  }
}

function loadSyncState(): Record<string, string> {
  try {
    if (fs.existsSync(SYNC_STATE_FILE)) {
      const data = fs.readFileSync(SYNC_STATE_FILE, "utf8");
      // Handle empty file case
      if (!data.trim()) {
        console.log("Sync state file is empty, initializing...");
        return {};
      }
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading sync state:", error);
    // Try to create an empty file if it doesn't exist or is corrupted
    try {
      fs.writeFileSync(SYNC_STATE_FILE, "{}");
      console.log("Created new sync state file");
    } catch (writeError) {
      console.error("Could not create sync state file:", writeError);
    }
  }
  return {};
}

function saveSyncState(state: Record<string, string>): void {
  try {
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
    console.log("Sync state saved");
  } catch (error) {
    console.error("Error saving sync state:", error);
  }
}

async function hasCreatedAtColumn(table: string): Promise<boolean> {
  try {
    const result = await pgClient.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'created_at'
    `, [table]);
    return (result.rowCount || 0) > 0;
  } catch (error) {
    console.error(`Error checking created_at column for table ${table}:`, error);
    return false;
  }
}

async function getCurrentPgTimestamp(): Promise<string> {
  try {
    // Use PostgreSQL's NOW() to get server timestamp in the right timezone
    const result = await pgClient.query("SELECT NOW() as current_timestamp");
    return result.rows[0].current_timestamp.toISOString();
  } catch (error) {
    console.error("Error getting PostgreSQL timestamp:", error);
    // Fallback to local timestamp
    return new Date().toISOString();
  }
}

fetchTables();
