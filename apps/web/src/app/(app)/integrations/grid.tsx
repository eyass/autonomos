"use client";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { connectOAuthAction, connectSandboxAction, disconnectAction, refreshInventoryAction, rotateWebhookSecretAction } from "./actions";
import { SystemLogo } from "./add-systems";
import type { IntegrationView, InventoryView } from "./data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function IntegrationGrid({ integrations, canManage, compact, highlight = [] }: { integrations: IntegrationView[]; canManage: boolean; compact?: boolean; highlight?: string[] }) {
  // Connected systems first, then tools detected on the company website, then the rest.
  const connected = integrations.filter((i) => i.status === "connected");
  const found = integrations.filter((i) => i.status !== "connected" && highlight.includes(i.key));
  const rest = integrations.filter((i) => i.status !== "connected" && !highlight.includes(i.key));
  const categories = [...new Set(rest.map((i) => i.category))];
  const section = (title: string, items: IntegrationView[], note?: string) => (
    <section key={title}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {note ? <p className="-mt-1 mb-2 text-xs text-muted-foreground">{note}</p> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((i) => (
          <IntegrationCard key={i.key} i={i} canManage={canManage} compact={compact} found={highlight.includes(i.key)} />
        ))}
      </div>
    </section>
  );
  const live = connected.filter((i) => i.provider !== "sandbox");
  // With many systems, filter the connected ones instead of scrolling past all of them.
  const [filter, setFilter] = useState<"all" | "live" | "sample" | "used">("all");
  const shown = connected.filter((i) => (filter === "live" ? i.provider !== "sandbox" : filter === "sample" ? i.provider === "sandbox" : filter === "used" ? i.agents.length > 0 : true));
  const filters = [
    ["all", `All (${connected.length})`],
    ["live", `Live (${live.length})`],
    ["sample", `Sample data (${connected.length - live.length})`],
    ["used", `In use by agents (${connected.filter((i) => i.agents.length).length})`],
  ] as const;
  const others = (
    <>
      {found.length ? section("Found on your website", found, "Detected from your website and email setup.") : null}
      {categories.map((cat) =>
        section(
          found.length || connected.length ? `Other ${cat.toLowerCase()} tools` : cat,
          rest.filter((i) => i.category === cat),
        ),
      )}
    </>
  );
  return (
    <div className="space-y-6">
      {connected.length && !compact ? (
        // One line to scan before anything else: how many real accounts agents could act in.
        <p className="rounded-md border px-3 py-2 text-sm" data-testid="connections-summary">
          <span className="font-medium">{connected.length} connected</span>
          {": "}
          {live.length ? (
            <>
              <span className="font-medium text-success">{live.length} live</span> ({live.map((i) => i.name).join(", ")}), where agent actions change real data
            </>
          ) : (
            "none live"
          )}
          {connected.length - live.length ? `; ${connected.length - live.length} on sample data` : ""}.
        </p>
      ) : null}
      {connected.length > 4 && !compact ? (
        <div role="group" aria-label="Show connected systems" className="flex flex-wrap gap-2 text-sm">
          {filters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1 ${filter === key ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {connected.length ? section("Connected", compact ? connected : shown) : null}
      {connected.length && !compact ? (
        <details className="group space-y-6">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Add another system ({found.length + rest.length} available)</summary>
          <div className="mt-4 space-y-6">{others}</div>
        </details>
      ) : (
        others
      )}
    </div>
  );
}

function IntegrationCard({ i, canManage, compact, found }: { i: IntegrationView; canManage: boolean; compact?: boolean; found?: boolean }) {
  const [review, setReview] = useState(false);
  const connected = i.status === "connected";
  const available = i.sandboxAvailable || i.oauthAvailable;
  return (
    <Card data-testid={`integration-${i.key}`} className="min-w-0 gap-3 sm:gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SystemLogo src={i.logo} name={i.name} className="size-6" />
          {i.name}
        </CardTitle>
        <CardDescription className={connected || review ? "line-clamp-2" : "line-clamp-1"}>{i.description}</CardDescription>
        <CardAction className="flex items-center gap-2">
          {connected ? (
            <Badge
              variant={i.provider === "sandbox" ? "warning" : "success"}
              title={i.provider === "sandbox" ? "Sample data held in AutonomOS; nothing real changes" : "A real account: agent actions change real data"}
            >
              Connected · {i.provider === "sandbox" ? "sandbox" : "live"}
            </Badge>
          ) : (
            <>
              {found ? <Badge variant="info">Detected</Badge> : null}
              {canManage && available && !review ? (
                <Button size="sm" variant="outline" onClick={() => setReview(true)}>
                  Connect
                </Button>
              ) : !available ? (
                <Badge variant="secondary">Soon</Badge>
              ) : null}
            </>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 empty:hidden">
        {connected && !compact ? (
          <>
            {i.inventory ? (
              <p className="text-sm" data-testid={`inventory-${i.key}`}>
                {inventoryLine(i.inventory)}
              </p>
            ) : null}
            {/* Connecting grants no agent access by itself: say which agents may do what here. */}
            <div className="text-xs" data-testid={`agents-${i.key}`}>
              {i.agents.length ? (
                <ul className="space-y-0.5">
                  {i.agents.map((a) => (
                    <li key={a.id}>
                      <a href={`/agents/${a.id}`} className="font-medium hover:underline">
                        {a.name}
                      </a>{" "}
                      <span className="text-muted-foreground">
                        ({a.status === "active" ? "live" : a.status}): {a.reads.length ? `reads ${a.reads.join(", ").toLowerCase()}` : "reads nothing"}
                        {a.acts.length ? `; can ${a.acts.join(", ").toLowerCase()}` : "; changes nothing"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">No agent uses it. Being connected gives agents no access on its own.</span>
              )}
            </div>
            <Collapsible className="text-xs">
              <CollapsibleTrigger asChild>
                <Button variant="link" size="sm" className="group h-auto px-0 text-xs text-muted-foreground">
                  {i.inventory?.groups.length ? "What AutonomOS found" : "Details"}
                  <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {i.inventory?.groups.length ? <InventoryDetails inventory={i.inventory} /> : null}
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 [&>dd]:min-w-0 [&>dd]:truncate">
                  <dt className="text-muted-foreground">Account</dt>
                  <dd>
                    {i.accountLabel ?? "–"}
                    {i.provider === "sandbox" ? " (sample data held in AutonomOS)" : ""}
                  </dd>
                  <dt className="text-muted-foreground">Last used</dt>
                  <dd>{i.lastUsedLabel ? `by an agent ${i.lastUsedLabel}` : "Not used by an agent yet"}</dd>
                  <dt className="text-muted-foreground">Connected</dt>
                  <dd>
                    {i.connectedAtLabel ?? "–"}
                    {i.connectedBy ? ` by ${i.connectedBy}` : ""}
                  </dd>
                </dl>
                <Access i={i} />
                {i.webhook ? <WebhookInfo integrationKey={i.key} webhook={i.webhook} /> : null}
              </CollapsibleContent>
            </Collapsible>
          </>
        ) : review ? (
          <Access i={i} />
        ) : null}
      </CardContent>
      {canManage && (connected || review) ? (
        <CardFooter className="flex-wrap gap-2">
          {connected ? (
            <>
              {i.oauthAvailable && i.provider === "composio" ? (
                <ActionButton size="sm" variant="outline" action={() => connectOAuthAction(i.key)}>
                  Reconnect
                </ActionButton>
              ) : null}
              {i.inventory && i.inventory.state !== "running" ? (
                <ActionButton size="sm" variant="outline" action={() => refreshInventoryAction(i.key)}>
                  Map again
                </ActionButton>
              ) : null}
              <ActionButton
                size="sm"
                variant="outline"
                confirm={`Disconnect ${i.name}? Agents using it will fail until it is reconnected.`}
                confirmLabel="Disconnect"
                action={() => disconnectAction(i.key)}
              >
                Disconnect
              </ActionButton>
            </>
          ) : !available || !review ? null : (
            <>
              {i.oauthAvailable ? (
                <ActionButton size="sm" action={() => connectOAuthAction(i.key)}>
                  Connect {i.name}
                </ActionButton>
              ) : null}
              {i.sandboxAvailable ? (
                <ActionButton size="sm" variant={i.oauthAvailable ? "outline" : "default"} action={() => connectSandboxAction(i.key)}>
                  Use sandbox data
                </ActionButton>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setReview(false)}>
                Cancel
              </Button>
            </>
          )}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function inventoryLine(inv: InventoryView) {
  if (inv.state === "running") return "Mapping what it holds…";
  if (inv.state === "failed") return `Could not map it${inv.error ? `: ${inv.error}` : ""}. Map again to retry.`;
  if (inv.state === "none" || !inv.summary) return "Not mapped yet. Maps on the next read.";
  return `${inv.summary} (mapped ${inv.takenAtLabel})`;
}

const KIND_LABEL: Record<string, string> = { mailbox: "Mailbox", "sample data": "Sample data", "readable record": "Readable records" };

// Everything the inventory found, by kind: projects, tables, ad accounts, pipelines…
function InventoryDetails({ inventory }: { inventory: InventoryView }) {
  return (
    <div className="space-y-2 rounded-md bg-muted p-3">
      {inventory.groups.map((g) => (
        <div key={g.kind}>
          <div className="font-medium">{KIND_LABEL[g.kind] ?? `${g.kind.charAt(0).toUpperCase()}${g.kind.slice(1)}s`}</div>
          <p className="break-words text-muted-foreground">
            {g.items.join(", ")}
            {g.more ? `, and ${g.more} more` : ""}
          </p>
        </div>
      ))}
      {inventory.notes.length ? <p className="text-muted-foreground">{inventory.notes.join(" ")}</p> : null}
      <p className="text-muted-foreground">Only names, fields and counts are kept, never the records.</p>
    </div>
  );
}

// What connecting grants, and what agents may be allowed to do with it.
function Access({ i }: { i: IntegrationView }) {
  return (
    <div className="grid gap-3 rounded-md bg-muted p-3 text-xs sm:grid-cols-2">
      <div>
        <div className="mb-1 font-medium">Access AutonomOS asks for</div>
        <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
          {i.permissions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-1 font-medium">What an agent can be allowed to do</div>
        {i.agentReads.length ? <p className="text-muted-foreground">Look up: {i.agentReads.join(", ").toLowerCase()}.</p> : null}
        {i.agentActs.length ? <p className="text-muted-foreground">Act: {i.agentActs.join(", ").toLowerCase()}.</p> : null}
        {!i.agentReads.length && !i.agentActs.length ? <p className="text-muted-foreground">Used for discovery only for now.</p> : null}
        <p className="mt-1 text-muted-foreground">Each agent gets only the actions you tick for it.</p>
      </div>
    </div>
  );
}

function WebhookInfo({ integrationKey, webhook }: { integrationKey: string; webhook: { url: string; secret: string } }) {
  const [show, setShow] = useState(false);
  return (
    <Collapsible className="text-xs">
      <CollapsibleTrigger asChild>
        <Button variant="link" size="sm" className="group h-auto max-w-full justify-start whitespace-normal px-0 text-left text-xs text-muted-foreground">
          Event webhook: send events from your own systems
          <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1 rounded-md bg-muted p-3">
        <div>
          POST <code className="break-all">{webhook.url}</code>
        </div>
        <div>
          Body <code className="break-all">{`{"event":"zendesk.ticket.created","data":{"ticket_id":"123"}}`}</code>
        </div>
        <div>
          Header <code className="break-all">X-AutonomOS-Signature: sha256=HMAC_SHA256(body, secret)</code>
        </div>
        <div>
          Secret{" "}
          {show ? (
            <code className="break-all">{webhook.secret}</code>
          ) : (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShow(true)}>
              Reveal
            </Button>
          )}
        </div>
        <div className="pt-1">
          <ActionButton
            size="sm"
            variant="outline"
            confirm="Rotate the signing secret? Events signed with the old secret are rejected from now on, so update the sender straight away."
            confirmLabel="Rotate secret"
            action={() => rotateWebhookSecretAction(integrationKey)}
          >
            Rotate secret
          </ActionButton>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
