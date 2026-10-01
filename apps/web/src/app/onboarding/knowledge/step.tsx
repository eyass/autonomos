"use client";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { KnowledgeManager } from "@/components/knowledge/knowledge-manager";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CompanyBrief } from "@autonomos/schemas";
import type { KnowledgeSourceView } from "@/server/knowledge";
import { BottomBar } from "../bottom-bar";
import { finishKnowledgeAction } from "../actions";

// Required: at least one source beyond the website before going on. Reading carries on in
// the background after Continue.
export function KnowledgeStep({ sources, brief }: { sources: KnowledgeSourceView[]; brief: CompanyBrief | null }) {
  const [list, setList] = useState(sources);
  const onChange = useCallback((s: KnowledgeSourceView[]) => setList(s), []);
  const [pending, start] = useTransition();
  // Sources the company added itself; the website and a help centre found on it do not count.
  const added = list.filter((s) => !s.auto).length;
  return (
    <>
      <KnowledgeManager initialSources={sources} initialBrief={brief} canEdit onChange={onChange} />
      <BottomBar hint={added ? "Reading carries on while you connect your systems." : "Add at least one document, your help centre or a piece of text to continue."}>
        <Button
          disabled={pending || !added}
          onClick={() =>
            start(async () => {
              const r = await finishKnowledgeAction();
              if (r && !r.ok) toast.error(r.error);
            })
          }
        >
          {pending ? <Spinner /> : null}
          Continue
        </Button>
      </BottomBar>
    </>
  );
}
