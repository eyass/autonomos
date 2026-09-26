import { ButtonLink } from "@/components/app/button-link";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export default function AppNotFound() {
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>This page does not exist, was removed, or belongs to another workspace.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <ButtonLink href="/">Back to overview</ButtonLink>
        <ButtonLink href="/activity" variant="outline">
          Activity
        </ButtonLink>
      </EmptyContent>
    </Empty>
  );
}
