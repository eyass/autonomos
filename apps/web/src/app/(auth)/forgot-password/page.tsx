import type { Metadata } from "next";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a link to reset your AutonomOS password.",
  alternates: { canonical: "/forgot-password" },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
