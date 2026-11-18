// Demo data for the app. Run it with the run_script tool: { "path": "server/seed.ts" }.
// To start over, call reset_data first. Keep it idempotent: skip if data already exists.
import { get, insertMany, migrate } from "./platform/db.ts";
import { createUser } from "./platform/auth.ts";
import { fake } from "./platform/fake.ts";

migrate();

if (get("SELECT 1 FROM notes LIMIT 1")) {
  console.log("Already seeded; call reset_data first to re-seed.");
  process.exit(0);
}

// A user you can sign in as (and pass to screenshot_app as signed_in_as).
const demo = createUser({ email: "demo@example.com", password: "demo-pass-123", name: "Demo User" });

const n = insertMany(
  "notes",
  Array.from({ length: 40 }, () => ({ user_id: demo.id, body: fake.sentence(), created_at: fake.sqlDate(60) })),
);

console.log(`Seeded ${n} notes for ${demo.email} (password demo-pass-123).`);
