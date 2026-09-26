"use client";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge, Card } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { connectOAuthAction, connectSandboxAction, disconnectAction } from "./actions";
import type { IntegrationView } from "./data";

export function IntegrationGrid({ integrations, canManage, compact }: { integrations: IntegrationView[]; canManage: boolean; compact?: boolean }) {
  const categories = [...new Set(integrations.map((i) => i.category))];
  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {integrations
              .filter((i) => i.category === cat)
              .map((i) => (
                <IntegrationCard key={i.key} i={i} canManage={canManage} compact={compact} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function IntegrationCard({ i, canManage, compact }: { i: IntegrationView; canManage: boolean; compact?: boolean }) {
  const [review, setReview] = useState(false);
  const connected = i.status === "connected";
  const available = i.sandboxAvailable || i.oauthAvailable;
  return (
    <Card className="p-4" data-testid={`integration-${i.key}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {i.name}
            {connected ? <Badge tone="ok">Connected{i.provider === "sandbox" ? " · sandbox" : ""}</Badge> : <Badge>Not connected</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted">{i.description}</p>
        </div>
      </div>
      {connected && !compact ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs [&>dd]:min-w-0 [&>dd]:truncate">
          <dt className="text-muted">Account</dt>
          <dd>{i.accountLabel ?? "–"}</dd>
          <dt className="text-muted">Connected by</dt>
          <dd>{i.connectedBy ?? "–"}</dd>
          <dt className="text-muted">Connected</dt>
          <dd>{dateTime(i.connectedAt)}</dd>
        </dl>
      ) : null}
      {(review || (connected && !compact)) && (
        <div className="mt-3 rounded-md bg-surface-muted p-3 text-xs">
          <div className="mb-1 font-medium">AutonomOS may</div>
          <ul className="list-inside list-disc space-y-0.5 text-muted">
            {i.permissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {i.agentActions.length ? (
            <p className="mt-2 text-muted">Agents only get the actions you allow each agent, for example: {i.agentActions.join(", ").toLowerCase()}.</p>
          ) : null}
        </div>
      )}
      {connected && !compact && i.webhook ? <WebhookInfo webhook={i.webhook} /> : null}
      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {connected ? (
            <>
              {i.oauthAvailable && i.provider === "composio" ? (
                <ActionButton size="sm" variant="secondary" action={() => connectOAuthAction(i.key)}>
                  Reconnect
                </ActionButton>
              ) : null}
              <ActionButton size="sm" variant="ghost" confirm={`Disconnect ${i.name}? Agents using it will fail until it is reconnected.`} action={() => disconnectAction(i.key)}>
                Disconnect
              </ActionButton>
            </>
          ) : !available ? (
            <span className="text-xs text-muted">Available soon</span>
          ) : !review ? (
            <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => setReview(true)}>
              Connect
            </button>
          ) : (
            <>
              {i.oauthAvailable ? (
                <ActionButton size="sm" action={() => connectOAuthAction(i.key)}>
                  Connect {i.name}
                </ActionButton>
              ) : null}
              {i.sandboxAvailable ? (
                <ActionButton size="sm" variant={i.oauthAvailable ? "secondary" : "primary"} action={() => connectSandboxAction(i.key)}>
                  Use sandbox data
                </ActionButton>
              ) : null}
              <button type="button" className="text-xs text-muted" onClick={() => setReview(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function WebhookInfo({ webhook }: { webhook: { url: string; secret: string } }) {
  const [show, setShow] = useState(false);
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted">Event webhook</summary>
      <div className="mt-2 space-y-1 rounded-md bg-surface-muted p-3">
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
            <button type="button" className="text-accent hover:underline" onClick={() => setShow(true)}>
              Reveal
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
