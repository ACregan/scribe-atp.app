import "@testing-library/jest-dom";

// auth.server.ts throws at import time if this is unset. Every existing test
// file mocks ~/services/auth.server wholesale, so this was never needed
// until auth.server.test.ts started importing the real module. `??=` so a
// real value (if one is ever set some other way) always wins.
process.env.SESSION_SECRET ??=
  "test-session-secret-at-least-32-characters-long-000000";
// db.server.ts opens data/oauth.db (the real dev database) at import time
// unless overridden — point tests at an isolated in-memory database instead.
process.env.CMS_DB_PATH ??= ":memory:";
// Same reasoning for the Image Service's own SQLite database.
process.env.IMAGE_DB_PATH ??= ":memory:";
