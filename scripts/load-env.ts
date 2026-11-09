import { config } from "dotenv";

// Same precedence as Next.js: .env.local overrides .env.
config({ path: [".env.local", ".env"], quiet: true });
