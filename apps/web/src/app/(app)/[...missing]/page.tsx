import { notFound } from "next/navigation";

// Unknown URLs for signed-in users render the 404 inside the app shell, so the navigation
// stays available instead of a dead end.
export default function Missing() {
  notFound();
}
