// TODO: Parse and validate environment variables at startup.
// - Use a schema validation library (e.g. zod) to enforce required fields
// - Throw a descriptive error on missing or malformed values
// - Expose a single typed `env` object consumed across the codebase

export const env = {
  // TODO: populate from process.env with validation
} as const;
