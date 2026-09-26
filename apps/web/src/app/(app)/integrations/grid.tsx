"use client";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { dateTime } from "@/lib/format";
import { connectOAuthAction, connectSandboxAction, disconnectAction } from "./actions";
import type { IntegrationView } from "./data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function IntegrationGrid({ integrations, canManage, compact, highlight = [] }: { integrations: IntegrationView[]; canManage: boolean; compact?: boolean; highlight?: string[] }) {
  // Tools detected on the company website come first, so connecting them is one step.
  const found = integrations.filter((i) => highlight.includes(i.key));
  const rest = integrations.filter((i) => !highlight.includes(i.key));
  const categories = [...new Set(rest.map((i) => i.category))];
  const section = (title: string, items: IntegrationView[], note?: string) => (
    <section key={title}>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {note ? <p className="-mt-1 mb-2 text-xs text-muted-foreground">{note}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((i) => (
          <IntegrationCard key={i.key} i={i} canManage={canManage} compact={compact} found={highlight.includes(i.key)} />
        ))}
      </div>
    </section>
  );
  return (
    <div className="space-y-6">
      {found.length ? section("Found on your website", found, "Detected from your website and email setup.") : null}
      {categories.map((cat) =>
        section(
          found.length ? `Other ${cat.toLowerCase()} tools` : cat,
          rest.filter((i) => i.category === cat),
        ),
      )}
    </div>
  );
}

function IntegrationCard({ i, canManage, compact, found }: { i: IntegrationView; canManage: boolean; compact?: boolean; found?: boolean }) {
  const [review, setReview] = useState(false);
  const connected = i.status === "connected";
  const available = i.sandboxAvailable || i.oauthAvailable;
  return (
    <Card data-testid={`integration-${i.key}`} className="gap-3 sm:gap-4">
      <CardHeader>
        <CardTitle>{i.name}</CardTitle>
        <CardDescription>{i.description}</CardDescription>
        <CardAction>
          {connected ? (
            <Badge variant="success">Connected{i.provider === "sandbox" ? " · sandbox" : ""}</Badge>
          ) : found ? (
            <Badge variant="info">Detected</Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 empty:hidden">
        {connected && !compact ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs [&>dd]:min-w-0 [&>dd]:truncate">
            <dt className="text-muted-foreground">Account</dt>
            <dd>{i.accountLabel ?? "–"}</dd>
            <dt className="text-muted-foreground">Connected by</dt>
            <dd>{i.connectedBy ?? "–"}</dd>
            <dt className="text-muted-foreground">Connected</dt>
            <dd>{dateTime(i.connectedAt)}</dd>
          </dl>
        ) : null}
        {(review || (connected && !compact)) && (
          <div className="rounded-md bg-muted p-3 text-xs">
            <div className="mb-1 font-medium">AutonomOS may</div>
            <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
              {i.permissions.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            {i.agentActions.length ? <p className="mt-2 text-muted-foreground">Agents only get the actions you allow each agent, for example: {i.agentActions.join(", ").toLowerCase()}.</p> : null}
          </div>
        )}
        {connected && !compact && i.webhook ? <WebhookInfo webhook={i.webhook} /> : null}
      </CardContent>
      {canManage ? (
        <CardFooter className="flex-wrap gap-2">
          {connected ? (
            <>
              {i.oauthAvailable && i.provider === "composio" ? (
                <ActionButton size="sm" variant="outline" action={() => connectOAuthAction(i.key)}>
                  Reconnect
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
          ) : !available ? (
            <span className="text-xs text-muted-foreground">Available soon</span>
          ) : !review ? (
            <Button size="sm" variant="outline" onClick={() => setReview(true)}>
              Connect
            </Button>
          ) : (
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

function WebhookInfo({ webhook }: { webhook: { url: string; secret: string } }) {
  const [show, setShow] = useState(false);
  return (
    <Collapsible className="text-xs">
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground">Event webhook</CollapsibleTrigger>
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
      </CollapsibleContent>
    </Collapsible>
  );
}
