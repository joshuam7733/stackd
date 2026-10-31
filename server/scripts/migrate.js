// `npm run db:migrate` — apply pending schema migrations.
import { config } from '../config.js';
import { openDatabase, migrate } from '../db/sqlite.js';

const sql = openDatabase(config.databaseUrl);
const ran = migrate(sql);
console.log(ran.length ? `[db] ${ran.length} migration(s) applied to ${sql.path}` : `[db] ${sql.path} is up to date`);
sql.close();
