import Link from "next/link";
import type * as React from "react";
import { Button } from "@/components/ui/button";

// A Next.js link styled as a shadcn Button (the documented `asChild` pattern).
export function ButtonLink({ href, children, ...props }: Omit<React.ComponentProps<typeof Button>, "asChild"> & { href: string }) {
  return (
    <Button asChild {...props}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
