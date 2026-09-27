export const CONTACT_EMAIL = "hello@autonomos.ai";
export const SECURITY_EMAIL = "security@autonomos.ai";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://autonom-ten.vercel.app").replace(/\/$/, "");
// The brand share card (app/opengraph-image.tsx). Pages that set their own openGraph replace
// the parent's, so each one lists it explicitly.
export const OG_IMAGES = [{ url: "/opengraph-image", width: 1200, height: 630, alt: "AutonomOS: find the recurring work, deploy constrained AI agents" }];
