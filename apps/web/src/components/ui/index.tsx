import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:bg-accent/90",
        secondary: "border border-border bg-surface text-foreground hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        danger: "bg-danger text-white hover:bg-danger/90",
        link: "text-accent underline-offset-4 hover:underline px-0",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4", lg: "h-11 px-5 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({ className, variant, size, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-border px-5 py-4", className)}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-surface-muted text-muted",
      accent: "bg-accent-soft text-accent",
      ok: "bg-ok-soft text-ok",
      warn: "bg-warn-soft text-warn",
      danger: "bg-danger-soft text-danger",
      info: "bg-info-soft text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const field = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/30";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-9 py-0", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium", className)} {...props} />;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("px-4 py-3", className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </Card>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap border-b border-border px-4 py-2 text-left text-xs font-medium text-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-4 py-2.5 align-middle", className)} {...props} />;
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "danger" | "ok"; children: React.ReactNode; className?: string }) {
  const tones = { info: "bg-info-soft text-info", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", ok: "bg-ok-soft text-ok" };
  return <div className={cn("rounded-md px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}
