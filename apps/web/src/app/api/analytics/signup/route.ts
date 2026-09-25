import { NextResponse } from "next/server";
import { track } from "@/lib/audit";
import { getUser } from "@/lib/session";

export async function POST() {
  const user = await getUser();
  if (user) await track({ user: { id: user.id } }, "user_signed_up");
  return NextResponse.json({ ok: true });
}
