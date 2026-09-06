import 'dotenv/config';
import {createApp} from './app.js';
import {loadEnv} from './config/env.js';

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, () => {
  console.log(
    `ClipForge API listening on ${env.PUBLIC_API_URL} (port ${String(env.PORT)})`,
  );
  console.log(`CORS allowlist: ${env.corsOrigins.join(', ')}`);
});
