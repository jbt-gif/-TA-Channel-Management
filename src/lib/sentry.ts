import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  try {
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["Authorization"];
        }
        return event;
      },
    });
    console.log("Sentry error monitoring enabled");
  } catch (err) {
    // Observability must never block the server from starting — a bad/unreachable
    // DSN is the same non-fatal case as an unset one, not a fail-fast condition
    // like CORS_ORIGIN/JWT_SECRET.
    console.error("Sentry init failed, continuing without it:", err instanceof Error ? err.message : err);
  }
} else {
  console.log("Sentry disabled (SENTRY_DSN not set)");
}
