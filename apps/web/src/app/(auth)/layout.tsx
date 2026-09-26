import Link from "next/link";
import { Logo } from "@/components/brand/logo";

// The shadcn login-03 block layout.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="self-center" aria-label="AutonomOS home">
          <Logo markClassName="size-7" />
        </Link>
        {children}
        <nav aria-label="Legal" className="flex justify-center gap-4 text-xs text-muted-foreground">
          <Link href="/security" className="hover:text-foreground">
            Security
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </div>
  );
}
