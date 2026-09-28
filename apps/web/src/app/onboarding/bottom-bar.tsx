import { cn } from "@/lib/utils";

// The step's actions, pinned to the bottom of the window so they never scroll out of view.
// Inside a form it still submits it: position does not change where it sits in the form.
export function BottomBar({ children, hint, wide = false }: { children: React.ReactNode; hint?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgb(0_0_0/0.12)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className={cn("mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", wide ? "max-w-5xl" : "max-w-2xl")}>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
        {hint ? <p className="hidden text-xs text-muted-foreground sm:ml-auto sm:block sm:max-w-sm sm:text-right">{hint}</p> : null}
      </div>
    </div>
  );
}
