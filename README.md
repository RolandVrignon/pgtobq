# pg_to_bq_ts

Ce projet permet de copier des tables d'une base PostgreSQL vers BigQuery en utilisant TypeScript et Docker.

## Prérequis
- Node.js
- Docker
- Un compte Google Cloud avec un service account BigQuery

---

## 1. Comment obtenir les informations pour la configuration

### Informations PostgreSQL
- **PG_HOST** : Adresse du serveur PostgreSQL (ex : `localhost` ou IP/hostname du serveur distant).
- **PG_PORT** : Port d'écoute de PostgreSQL (par défaut : `5432`).
- **PG_USER** et **PG_PASSWORD** : Identifiants d'un utilisateur ayant accès en lecture aux tables à migrer (demander à l'administrateur ou créer un utilisateur dédié).
- **PG_DATABASE** : Nom de la base de données source.

### Informations BigQuery
- **GOOGLE_APPLICATION_CREDENTIALS** : Chemin absolu vers le fichier JSON du service account Google Cloud ayant les droits d'écriture sur BigQuery.
  - Pour l'obtenir :
    1. Aller sur la [console Google Cloud IAM & Admin > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
    2. Créer un service account ou en sélectionner un existant.
    3. Lui attribuer le rôle `BigQuery Data Editor` (ou équivalent).
    4. Générer une clé JSON et la télécharger.
    5. Placer ce fichier sur la machine et renseigner son chemin absolu dans la variable.
- **BQ_PROJECT_ID** : Identifiant du projet Google Cloud (visible dans la console GCP, en haut à gauche).
- **BQ_DATASET** : Nom du dataset BigQuery cible (doit exister ou être créé dans la console BigQuery).

### Tables à migrer
- **TABLES** : Liste des tables à synchroniser, séparées par des virgules (ex : `users,orders,products`). Les tables doivent exister dans la base PostgreSQL source.

### Autres options
- **FETCH_ALL_ROWS** :
  - Si `true` : toutes les lignes de chaque table seront synchronisées à chaque exécution (ignorer l'historique).
  - Si `false` (valeur recommandée) : seules les nouvelles lignes depuis la dernière synchronisation (stockée dans `sync_state.json`) seront transférées, si la table possède une colonne `created_at`.
  - Par défaut : `false`.

---

## 2. Création de la table BigQuery
- **Création automatique** : Si la table n'existe pas dans BigQuery, le script la créera automatiquement avec un schéma basé sur la première ligne de données.
- **Création manuelle (optionnel)** : Vous pouvez créer le dataset et les tables à l'avance via la console BigQuery si vous souhaitez un contrôle précis sur le schéma.

---

## 3. Exemple de fichier `.env`

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

# Synchronisation mode
FETCH_ALL_ROWS=false
```

---

## 4. Résumé des étapes
1. Créer un service account Google Cloud avec les droits BigQuery, télécharger la clé JSON.
2. Créer (ou identifier) le dataset BigQuery cible.
3. Récupérer les accès PostgreSQL.
4. Remplir le fichier `.env` avec les informations ci-dessus.
5. Lancer le script en local ou via Docker.

---

## 5. À quoi sert le fichier `sync_state.json` ?

Ce fichier est utilisé pour mémoriser la date de la dernière synchronisation pour chaque table migrée.

- Lors de chaque exécution, le script enregistre pour chaque table la date de la dernière ligne synchronisée.
- Cela permet de ne synchroniser que les nouvelles données lors des prochaines exécutions (si la table possède une colonne `created_at`).
- Si le fichier est supprimé ou vide, une synchronisation complète sera effectuée.

**Remarque :** Ce fichier est automatiquement géré par le script, il n'est pas nécessaire de le modifier manuellement.

---

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