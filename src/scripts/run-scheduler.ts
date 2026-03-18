import { start } from "../index.js";

start().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
