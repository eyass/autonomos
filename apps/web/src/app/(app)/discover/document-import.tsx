"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importDocumentAction } from "./actions";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function DocumentImport() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState<"upload" | "paste">("paste");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  async function onFile(file: File) {
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/documents/extract-text", { method: "POST", body });
    const json = await res.json();
    if (!json.ok) return setError(json.error);
    setTitle(json.data.title);
    setContent(json.data.content);
    setSource("upload");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import a document</CardTitle>
        <CardDescription>SOPs, process documentation, handbooks or team descriptions. PDF, DOCX, TXT or MD, or paste the text.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Upload a file" hint="PDF, DOCX, TXT or MD">
          <Input type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </FormField>
        <FormField label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Support team handbook" />
        </FormField>
        <FormField label="Content">
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} placeholder="Paste the document text" />
        </FormField>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          disabled={pending || !title.trim() || content.trim().length < 40}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await importDocumentAction({ title, content, source });
              if (!r.ok) return setError(r.error);
              router.push("/processes?status=draft");
            })
          }
        >
          {pending ? "Extracting processes…" : "Extract processes"}
        </Button>
      </CardContent>
    </Card>
  );
}
