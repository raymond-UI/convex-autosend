import AutoSendConsole from "@/components/autosend-console";

export default function HomePage() {
  return (
    <main className="min-h-svh py-8 px-4 sm:px-6 lg:px-8 pixel-grid">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border p-6 glass-card">
          <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
            Demo Stack: Next.js + Convex + Tailwind
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            AutoSend Mission Control
          </h1>
          <p className="mt-3 max-w-3xl text-sm sm:text-base text-[color:var(--muted-foreground)]">
            Build disposable inboxes with Mail.tm, dispatch transactional emails through
            the autosend Convex component, process queue batches, and inspect delivery
            lifecycle end-to-end in one operator surface.
          </p>
        </header>

        <AutoSendConsole />
      </div>
    </main>
  );
}
