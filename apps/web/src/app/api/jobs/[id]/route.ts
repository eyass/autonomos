import { z } from "zod";
import { handle } from "@/lib/actions";
import { getUser, HttpError } from "@/lib/session";
import { getJob } from "@/server/jobs";

// Reading a job can restart one whose server stopped, which then runs in this function.
export const maxDuration = 300;

// GET /api/jobs/:id — a background job as its owner sees it. Pages poll this.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await getUser();
    if (!user) throw new HttpError(401, "Sign in first");
    return getJob(
      user.id,
      z
        .string()
        .uuid()
        .parse((await params).id),
    );
  });
}
