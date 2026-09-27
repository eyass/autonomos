"use client";
import Link from "next/link";
import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DiscoverTab = "integrations" | "interview" | "document";
const TABS: Array<{ value: DiscoverTab; label: string }> = [
  { value: "integrations", label: "From your systems" },
  { value: "interview", label: "Interview" },
  { value: "document", label: "Document" },
];

// Switching tabs happens in the browser, with no server round trip. A panel mounts the first
// time it is opened and then stays mounted while hidden, so work in progress (an interview
// answer, a system read) is never torn down mid-flight by a tab switch. The address is kept in
// step so a reload or a shared link opens the same tab.
export function DiscoverTabs({ initial, panels }: { initial: DiscoverTab; panels: Record<DiscoverTab, ReactNode> }) {
  const [tab, setTab] = useState<DiscoverTab>(initial);
  const [opened, setOpened] = useState<DiscoverTab[]>([initial]);
  const choose = (value: string) => {
    const next = TABS.find((t) => t.value === value)?.value ?? "integrations";
    setTab(next);
    setOpened((o) => (o.includes(next) ? o : [...o, next]));
    const url = new URL(window.location.href);
    url.search = "";
    if (next !== "integrations") url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <>
      <Tabs value={tab} onValueChange={choose} className="mb-4">
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="data-[state=active]:text-brand">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/processes/new">Add manually</Link>
          </Button>
        </div>
      </Tabs>
      {TABS.filter((t) => opened.includes(t.value)).map((t) => (
        <div key={t.value} hidden={t.value !== tab} data-panel={t.value}>
          <PanelBoundary tab={t.value} onSwitch={choose}>
            {panels[t.value]}
          </PanelBoundary>
        </div>
      ))}
    </>
  );
}

// One failing way of discovering work never takes the others down: the failure stays in its
// panel, with Try again and the other tabs one click away.
class PanelBoundary extends Component<{ tab: DiscoverTab; onSwitch: (tab: DiscoverTab) => void; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("discover panel failed", this.props.tab, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const label = TABS.find((t) => t.value === this.props.tab)?.label ?? "This tab";
    return (
      <Card className="p-6" role="alert">
        <h2 className="font-semibold">{`${label} could not be shown`}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nothing you saved is lost. Try again, or use another way to add processes.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          {TABS.filter((t) => t.value !== this.props.tab).map((t) => (
            <Button key={t.value} variant="ghost" onClick={() => this.props.onSwitch(t.value)}>
              {t.label}
            </Button>
          ))}
        </div>
      </Card>
    );
  }
}
