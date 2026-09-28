"use client";
import { CURRENCIES, DEPARTMENTS, EMPLOYEE_COUNTS, INDUSTRIES } from "@autonomos/schemas";
import { Check, Globe, Sparkles } from "lucide-react";
import { useActionState, useEffect, useEffectEvent, useState, useTransition } from "react";
import { FormField } from "@/components/app/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { WebsiteAnalysis } from "@/server/company-profile";
import type { JobView } from "@/server/jobs";
import { requestJob, useJob } from "@/components/app/job";
import { createCompanyAction } from "../actions";
import { BottomBar } from "../bottom-bar";

const READING_STEPS = ["Reading your homepage", "Finding the about, pricing and careers pages", "Checking which tools you use", "Writing your company profile"];

// Reading the website runs as a job on the server, so closing the tab or reloading does not
// lose it: the page passes in the latest read and this picks it up, finished or not.
export function CompanyForm({ suggestedWebsite, initialJob = null }: { suggestedWebsite: string | null; initialJob?: JobView | null }) {
  const [website, setWebsite] = useState(suggestedWebsite?.replace(/^https:\/\//, "") ?? "");
  const finished = initialJob?.status === "done" ? ((initialJob.result?.analysis as WebsiteAnalysis | undefined) ?? null) : null;
  const [analysis, setAnalysis] = useState<WebsiteAnalysis | null>(finished);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(initialJob?.status === "failed" ? (initialJob.error ?? "Could not read the website").replace(/\.$/, "") : null);
  const [starting, startReading] = useTransition();
  const { running, follow } = useJob(initialJob?.status === "done" ? null : initialJob, (j) => {
    if (j.status === "failed") return setError((j.error ?? "Could not read the website").replace(/\.$/, ""));
    const a = j.result?.analysis as WebsiteAnalysis | undefined;
    if (a) {
      setAnalysis(a);
      setManual(false);
    }
  });
  const reading = starting || running;

  const read = (url: string) => {
    startReading(async () => {
      setError(null);
      const r = await requestJob("website_profile", { website: url });
      if (!r.ok) return setError(r.error.replace(/\.$/, ""));
      follow(r.data);
    });
  };

  // Start reading straight away when the work email already tells us the website, unless a
  // read is already under way or finished.
  const autoRead = useEffectEvent(() => {
    if (suggestedWebsite && !initialJob) read(suggestedWebsite);
  });
  useEffect(() => autoRead(), []);

  if (analysis || manual) return <ReviewForm key={analysis?.website ?? "manual"} analysis={analysis} website={analysis?.website ?? website} onRestart={() => (setAnalysis(null), setManual(false))} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where can we read about your company?</CardTitle>
        <CardDescription>We read a few public pages and fill in everything else. It takes about half a minute.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            read(website);
          }}
        >
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Company website" className="pl-9" placeholder="yourcompany.com" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={reading} />
          </div>
          <Button type="submit" disabled={reading || !website.trim()}>
            {reading ? <Spinner /> : <Sparkles />}
            Read my website
          </Button>
        </form>
        {reading ? <ReadingProgress /> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}. Check the address, or fill in the details yourself.</AlertDescription>
          </Alert>
        ) : null}
        {!reading ? (
          <Button type="button" variant="link" className="h-auto px-0 text-muted-foreground" onClick={() => setManual(true)}>
            No website yet? Fill it in yourself
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Mounted only while the website is being read, so it always starts from the first step.
function ReadingProgress() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1400);
    return () => clearInterval(t);
  }, []);
  const progress = Math.min(READING_STEPS.length - 1, tick);
  return (
    <div className="space-y-2">
      <ol className="space-y-2 text-sm" aria-live="polite">
        {READING_STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2", i > progress && "text-muted-foreground")}>
            {i < progress ? <Check className="size-4 text-success" /> : i === progress ? <Spinner className="size-4" /> : <span className="size-4" />}
            {s}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">This runs on our servers: you can leave or reload this page and come back to the result.</p>
    </div>
  );
}

function FromWebsite({ show }: { show: boolean }) {
  return show ? (
    <Badge variant="info" className="ml-1 align-middle">
      from your website
    </Badge>
  ) : null;
}

function ReviewForm({ analysis, website, onRestart }: { analysis: WebsiteAnalysis | null; website: string; onRestart: () => void }) {
  const [state, action, pending] = useActionState(createCompanyAction, null);
  const p = analysis?.profile;
  const found = Boolean(p);
  return (
    <form action={action} className="space-y-4">
      {analysis ? (
        <Alert variant="agent">
          <Sparkles />
          <AlertDescription>
            Read {analysis.pagesRead.length} page{analysis.pagesRead.length === 1 ? "" : "s"} of {new URL(analysis.website).hostname}
            {analysis.detectedTools.length ? ` and found ${analysis.detectedTools.map((t) => t.name).join(", ")}` : ""}. Check the details and change anything that is off.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Company name" htmlFor="name">
              <Input id="name" name="name" required maxLength={120} defaultValue={p?.name ?? ""} />
            </FormField>
            <FormField label="Website" htmlFor="website">
              <Input id="website" name="website" defaultValue={website} placeholder="https://" />
            </FormField>
            <FormField label="Industry" htmlFor="industry">
              <NativeSelect id="industry" name="industry" defaultValue={p?.industry ?? ""}>
                <NativeSelectOption value="">Select…</NativeSelectOption>
                {INDUSTRIES.map((i) => (
                  <NativeSelectOption key={i}>{i}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Number of employees" htmlFor="employeeCount" hint={found && !p?.employeeCount ? "Not on the website" : undefined}>
              <NativeSelect id="employeeCount" name="employeeCount" defaultValue={p?.employeeCount ?? ""}>
                <NativeSelectOption value="">Select…</NativeSelectOption>
                {EMPLOYEE_COUNTS.map((i) => (
                  <NativeSelectOption key={i}>{i}</NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Country" htmlFor="country">
              <Input id="country" name="country" defaultValue={p?.country ?? ""} />
            </FormField>
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <FormField label="Currency" htmlFor="currency">
                <NativeSelect id="currency" name="currency" defaultValue={p?.currency ?? "EUR"}>
                  {CURRENCIES.map((c) => (
                    <NativeSelectOption key={c}>{c}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Hourly labour cost" htmlFor="hourlyCost" hint={found ? "Typical for your country. Used to value time saved." : "Used to value time saved"}>
                <Input id="hourlyCost" name="hourlyCost" type="number" min={1} step="0.01" defaultValue={p?.hourlyCostEstimate ?? 45} />
              </FormField>
            </div>
          </div>
          <FormField label="What does your company do?" htmlFor="summary">
            <Textarea id="summary" name="summary" rows={4} defaultValue={p?.summary ?? ""} placeholder="We run an online marketplace for…" />
          </FormField>
          <FieldSet>
            <FieldLegend variant="label">
              Where should AutonomOS look for work to automate? <FromWebsite show={found} />
            </FieldLegend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEPARTMENTS.map((d) => (
                <FieldLabel key={d} htmlFor={`area-${d}`}>
                  <Field orientation="horizontal" className="p-3!">
                    <Checkbox id={`area-${d}`} name="areas" value={d} defaultChecked={p?.improvementAreas.includes(d) ?? false} />
                    <FieldContent>
                      <FieldTitle>{d}</FieldTitle>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              ))}
            </div>
          </FieldSet>
          {analysis && (analysis.detectedTools.length || analysis.otherTechnology.length) ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Tools we found</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.detectedTools.map((t) => (
                  <Badge key={t.key} variant="success" title={t.evidence}>
                    {t.name}
                  </Badge>
                ))}
                {analysis.otherTechnology.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">You can connect these in the next step. Nothing is connected without you.</p>
            </div>
          ) : null}
          {analysis ? <input type="hidden" name="analysis" value={JSON.stringify(analysis)} /> : null}
          {state && !state.ok ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <BottomBar hint="Next, connect the tools you use.">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              Create company
            </Button>
            {analysis ? null : (
              <Button type="button" variant="ghost" onClick={onRestart} disabled={pending}>
                Back
              </Button>
            )}
          </BottomBar>
        </CardContent>
      </Card>
    </form>
  );
}
