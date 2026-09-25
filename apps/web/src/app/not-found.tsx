import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted">This page does not exist or you do not have access to it.</p>
      <Link href="/" className="text-sm text-accent hover:underline">
        Back to overview
      </Link>
    </div>
  );
}
