export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-lg font-semibold tracking-tight">AutonomOS</div>
          <p className="mt-1 text-sm text-muted">How autonomous is your company?</p>
        </div>
        {children}
      </div>
    </div>
  );
}
