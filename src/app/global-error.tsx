"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body
        style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "6rem 1rem", color: "#0f1b2d" }}
      >
        <h1 style={{ fontSize: "1.75rem" }}>Something went wrong</h1>
        <p style={{ color: "#5b6b7f" }}>Please refresh the page or try again in a minute.</p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            background: "#0f7a3c",
            color: "#fff",
            border: 0,
            borderRadius: 999,
            padding: "0.75rem 1.5rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
