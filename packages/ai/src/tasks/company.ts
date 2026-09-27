import { CompanyProfileSchema, DEPARTMENTS, DocumentExtractionSchema, EMPLOYEE_COUNTS, InterviewSuggestionsSchema, type CompanyProfile, type DiscoveredProcess } from "@autonomos/schemas";
import { generateStructured, type UsageSink } from "../generate";
import { section } from "../prompt";
import { mockProcessesFromText, type CompanyContext, type InterviewMessage } from "./discovery";

// Structural copy of @autonomos/integrations/website's WebsiteSnapshot, so this package
// does not depend on the crawler.
export type WebsiteEvidence = {
  url: string;
  domain: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  language: string | null;
  organization: { name?: string; description?: string; country?: string; employees?: number; foundingDate?: string } | null;
  pages: Array<{ url: string; kind: string; title: string; text: string }>;
  detectedTools: Array<{ key: string; name: string; evidence: string }>;
  otherTechnology: string[];
};

type Department = (typeof DEPARTMENTS)[number];

const PROFILE_RULES = [
  "You are AutonomOS, setting up a company workspace from the company's own public website so the user does not have to type it.",
  "Use only what the website evidence supports. When a field is not supported, use null (or your best conservative estimate for currency and hourly cost, which are always required) and lower confidence.",
  "Never invent headcount, customers or tools. Detected tools come from page scripts and mail (MX) records and are reliable; everything else must come from page text or structured data.",
  "Pick the industry from the allowed list by what the company does, not by the words it uses. A platform where independent sellers and buyers trade is a Marketplace; a brand selling its own goods online is E-commerce.",
  "Write the summary for the company's own operations team: what it sells, to whom, and the kind of recurring work that implies. Plain sentences, no marketing language.",
  "likelyProcesses are recurring operational tasks a company like this almost certainly does (for example refund requests for a marketplace with Stripe and Zendesk). Name them the way an operations manager would. List up to 15, covering every department where the evidence suggests work. Only list processes the evidence supports.",
  "hourlyCostEstimate is a typical fully loaded labour cost for operational staff in the head-office country, in the chosen currency.",
];

export async function profileCompany(input: { website: WebsiteEvidence; emailDomain?: string | null; onUsage?: UsageSink }): Promise<CompanyProfile> {
  const w = input.website;
  const { object } = await generateStructured({
    purpose: "company_profile",
    modelClass: "SMART_MODEL",
    schema: CompanyProfileSchema,
    schemaName: "CompanyProfile",
    systemRules: PROFILE_RULES,
    sections: [
      section("site", { url: w.url, domain: w.domain, siteName: w.siteName, title: w.title, metaDescription: w.description, language: w.language, emailDomain: input.emailDomain ?? null }),
      section("structured_data", w.organization ?? "none published"),
      section("detected_tools", { integrations: w.detectedTools, otherTechnology: w.otherTechnology }),
      section("pages", w.pages.map((p) => `## ${p.kind}: ${p.title} (${p.url})\n${p.text}`).join("\n\n"), false),
    ],
    task: "Draft the company profile from this website evidence.",
    mock: () => mockProfile(w),
    onUsage: input.onUsage,
  });
  return {
    ...object,
    improvementAreas: [...new Set(object.improvementAreas)],
    likelyProcesses: object.likelyProcesses.slice(0, 15),
  };
}

export async function draftProcessInventory(input: {
  company: CompanyContext;
  profile: Pick<CompanyProfile, "summary" | "industry" | "customers" | "likelyProcesses" | "improvementAreas">;
  evidence: string[];
  onUsage?: UsageSink;
}): Promise<DiscoveredProcess[]> {
  const { object } = await generateStructured({
    purpose: "process_inventory_draft",
    modelClass: "SMART_MODEL",
    schema: DocumentExtractionSchema,
    schemaName: "ProcessInventoryDraft",
    systemRules: [
      "You are AutonomOS, a business process analyst drafting a first process inventory so the user can review instead of describing everything from scratch.",
      "Draft a shortlist of the recurring processes where an AI agent would add the most value for this company, from its profile and the evidence from connected systems. Start with the likely processes in the profile and what the connected systems show, then check each department (Customer Support, Sales, Finance, Marketing, Operations, Product, Engineering, HR) for high-value work specific to this company.",
      "Value first: include a process only when it takes real, repeated human time (several hours a month or more) that an agent could take over, or when it protects or grows money, customers, safety or compliance. Leave out generic office chores every company has (inbox tidying, meeting scheduling, filing, reading newsletters, internal status updates nobody acts on) and one-off or rare work.",
      "Be specific to this company: name its customers, products, marketplace or channels in the title and description, e.g. 'Breeder listing verification' rather than 'Content moderation'. If a process could be copied unchanged to any company, it is too generic; leave it out.",
      "Every process is inferred, so confidence must be 0.6 or lower unless connected-system evidence confirms it, and missingInformation must list what a person should confirm (volume, minutes per occurrence, who does it).",
      "Steps describe how the work is typically done by hand today. Estimate frequency and minutes conservatively.",
      "Autonomy levels: 1 human only, 2 agent assists, 3 agent proposes and a human approves, 4 agent executes with exceptions, 5 autonomous. Current level is usually 1.",
      "Scores are 1 to 5. businessValue: frequency, time, labour cost, customer and revenue impact. automationDifficulty: systems, steps, unstructured data, judgement, API availability. riskLevel: financial, customer and legal consequence, reversibility, data sensitivity.",
    ],
    sections: [section("company_context", input.company), section("company_profile", input.profile), section("connected_system_evidence", input.evidence.length ? input.evidence : "none yet")],
    task: "Draft the shortlist for this company: at most 12 processes, the most valuable first. Fewer strong ones beat many weak ones.",
    mock: () => ({
      processes: input.profile.likelyProcesses.flatMap((p) =>
        mockProcessesFromText(p.title, p.department, "document")
          .slice(0, 1)
          .map((d) => ({
            ...d,
            confidence: Math.min(d.confidence, 0.55),
            missingInformation: d.missingInformation.length ? d.missingInformation : ["Confirm how often this happens and how long it takes"],
          })),
      ),
    }),
    onUsage: input.onUsage,
  });
  return object.processes.slice(0, 15);
}

export async function suggestInterviewAnswers(input: {
  company: CompanyContext;
  department: string;
  messages: InterviewMessage[];
  likelyProcesses?: Array<{ title: string; department: string }>;
  onUsage?: UsageSink;
}): Promise<string[]> {
  const { object } = await generateStructured({
    purpose: "interview_suggestions",
    modelClass: "FAST_MODEL",
    schema: InterviewSuggestionsSchema,
    schemaName: "InterviewSuggestions",
    systemRules: [
      "You suggest answers a busy manager can send with one tap in a process-discovery interview.",
      "Answer the last question from the perspective of this company, using what is known about it. Keep each suggestion under 25 words, concrete and plausible. Offer different options, not rephrasings.",
      'When the interview has covered the main work, one suggestion should be "That covers the main work".',
    ],
    sections: [
      section("company_context", input.company),
      section("department", input.department),
      section("likely_processes", input.likelyProcesses ?? []),
      section("interview_transcript", input.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n"), false),
    ],
    task: "Suggest up to three answers to the last question.",
    mock: () => ({ suggestions: mockSuggestions(input.department, input.messages, input.likelyProcesses ?? []) }),
    onUsage: input.onUsage,
  });
  return object.suggestions;
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks (mock mode, and the offline demo)
// ---------------------------------------------------------------------------

const INDUSTRY_SIGNALS: Array<{ industry: CompanyProfile["industry"]; pattern: RegExp }> = [
  { industry: "Marketplace", pattern: /marketplace|buyers and sellers|sellers and buyers|buy and sell|list your|independent sellers/ },
  { industry: "Recruitment", pattern: /recruit|staffing|candidates|vacanc|talent acquisition/ },
  { industry: "Travel", pattern: /\btravel|holiday|booking.*(hotel|flight)|tour operator/ },
  { industry: "Property services", pattern: /real estate|property management|landlord|tenant|rental homes/ },
  { industry: "Online education", pattern: /online course|e-?learning|students|learn online|academy/ },
  { industry: "Insurance intermediary", pattern: /insurance|insurer|claims|broker/ },
  { industry: "SaaS", pattern: /software|saas|platform for teams|free trial|\bapi\b|dashboard|integrations/ },
  { industry: "E-commerce", pattern: /shop now|add to cart|free shipping|our store|order online|webshop/ },
  { industry: "Agency", pattern: /agency|we help brands|campaigns for clients/ },
  { industry: "Professional services", pattern: /consultan|accountan|law firm|advisory/ },
];

const TLD_COUNTRY: Record<string, string> = {
  nl: "Netherlands",
  de: "Germany",
  be: "Belgium",
  fr: "France",
  uk: "United Kingdom",
  es: "Spain",
  it: "Italy",
  se: "Sweden",
  dk: "Denmark",
  no: "Norway",
  ch: "Switzerland",
  ie: "Ireland",
  at: "Austria",
  pl: "Poland",
  pt: "Portugal",
  fi: "Finland",
  us: "United States",
  ca: "Canada",
  au: "Australia",
};
const ISO_COUNTRY: Record<string, string> = {
  NL: "Netherlands",
  DE: "Germany",
  BE: "Belgium",
  FR: "France",
  GB: "United Kingdom",
  UK: "United Kingdom",
  ES: "Spain",
  IT: "Italy",
  SE: "Sweden",
  DK: "Denmark",
  NO: "Norway",
  CH: "Switzerland",
  IE: "Ireland",
  AT: "Austria",
  PL: "Poland",
  PT: "Portugal",
  FI: "Finland",
  US: "United States",
  CA: "Canada",
  AU: "Australia",
};
const CITY_COUNTRY: Array<[RegExp, string]> = [
  [/amsterdam|rotterdam|utrecht|eindhoven|the hague|den haag/, "Netherlands"],
  [/berlin|munich|münchen|hamburg/, "Germany"],
  [/london|manchester/, "United Kingdom"],
  [/paris|lyon/, "France"],
  [/madrid|barcelona/, "Spain"],
  [/stockholm/, "Sweden"],
  [/copenhagen/, "Denmark"],
  [/dublin/, "Ireland"],
  [/new york|san francisco/, "United States"],
];
const COUNTRY_MONEY: Record<string, { currency: CompanyProfile["currency"]; hourly: number }> = {
  Netherlands: { currency: "EUR", hourly: 45 },
  Germany: { currency: "EUR", hourly: 48 },
  Belgium: { currency: "EUR", hourly: 47 },
  France: { currency: "EUR", hourly: 44 },
  Spain: { currency: "EUR", hourly: 30 },
  Italy: { currency: "EUR", hourly: 32 },
  Ireland: { currency: "EUR", hourly: 42 },
  Austria: { currency: "EUR", hourly: 44 },
  Portugal: { currency: "EUR", hourly: 22 },
  Finland: { currency: "EUR", hourly: 42 },
  "United Kingdom": { currency: "GBP", hourly: 38 },
  Switzerland: { currency: "CHF", hourly: 70 },
  Sweden: { currency: "SEK", hourly: 420 },
  Denmark: { currency: "DKK", hourly: 380 },
  Norway: { currency: "NOK", hourly: 480 },
  Poland: { currency: "PLN", hourly: 110 },
  "United States": { currency: "USD", hourly: 55 },
  Canada: { currency: "CAD", hourly: 55 },
  Australia: { currency: "AUD", hourly: 60 },
};

const LIKELY: Record<string, Array<[string, Department, string]>> = {
  Marketplace: [
    ["Refund request handling", "Customer Support", "Buyers pay through the platform and ask for refunds"],
    ["Support ticket response", "Customer Support", "Buyers and sellers contact support"],
    ["Review flagged listings", "Operations", "Listings from independent sellers need moderation"],
  ],
  "E-commerce": [
    ["Refund request handling", "Customer Support", "Customers pay online and return goods"],
    ["Support ticket response", "Customer Support", "Customers ask about orders and delivery"],
    ["Weekly sales reporting", "Operations", "Online sales are tracked weekly"],
  ],
  SaaS: [
    ["Support ticket response", "Customer Support", "Customers ask product questions"],
    ["Inbound lead qualification", "Sales", "Trial and demo requests arrive through the website"],
    ["Weekly business reporting", "Operations", "Subscription revenue is reviewed weekly"],
  ],
};

export function employeeBucket(n: number): (typeof EMPLOYEE_COUNTS)[number] {
  if (n < 20) return "1–19";
  if (n < 50) return "20–49";
  if (n < 100) return "50–99";
  if (n < 250) return "100–249";
  if (n < 500) return "250–499";
  return "500+";
}

function firstSentences(text: string, n: number) {
  return (text.replace(/\n+/g, " ").match(/[^.!?]+[.!?]/g) ?? [text]).slice(0, n).join(" ").trim();
}

export function mockProfile(w: WebsiteEvidence): CompanyProfile {
  const corpus = [w.title, w.description, w.organization?.description, ...w.pages.map((p) => p.text)].filter(Boolean).join("\n").toLowerCase();
  const evidence: CompanyProfile["evidence"] = [];
  const industry = INDUSTRY_SIGNALS.find((s) => s.pattern.test(corpus))?.industry ?? "Other";
  evidence.push({ field: "industry", source: industry === "Other" ? "no clear signal on the site" : "homepage and product text" });

  const titleName = (w.title ?? "").split(/\s[|–—-]\s/)[0]?.trim();
  const base = w.domain.split(".")[0] ?? w.domain;
  const name = w.organization?.name ?? w.siteName ?? (titleName || base.charAt(0).toUpperCase() + base.slice(1));
  evidence.push({ field: "name", source: w.organization?.name ? "structured data" : w.siteName ? "site name" : "page title" });

  const homeText = w.pages[0]?.text ?? "";
  const summary = (w.organization?.description ?? w.description ?? firstSentences(homeText, 2)) || `${name} operates ${w.domain}.`;

  const headcount = w.organization?.employees ?? Number(corpus.match(/\b(?:we are|team of|with)\s+(\d{1,5})\s+(?:people|employees|colleagues)/)?.[1] ?? NaN);
  const employeeCount = Number.isFinite(headcount) && headcount > 0 ? employeeBucket(headcount) : null;
  if (employeeCount) evidence.push({ field: "employeeCount", source: w.organization?.employees ? "structured data" : "about page" });

  const tld = w.domain.split(".").at(-1) ?? "";
  const country =
    (w.organization?.country ? (ISO_COUNTRY[w.organization.country.toUpperCase()] ?? w.organization.country) : null) ?? CITY_COUNTRY.find(([re]) => re.test(corpus))?.[1] ?? TLD_COUNTRY[tld] ?? null;
  if (country) evidence.push({ field: "country", source: w.organization?.country ? "structured data" : "address or domain" });
  const money = (country && COUNTRY_MONEY[country]) || { currency: "EUR" as const, hourly: 45 };

  const tools = new Set(w.detectedTools.map((t) => t.key));
  const areas: Department[] = [];
  if (tools.has("zendesk") || tools.has("intercom") || /support|help cent|customer service|klantenservice/.test(corpus)) areas.push("Customer Support");
  if (industry === "Marketplace" || /listing|shipping|delivery|fulfil/.test(corpus)) areas.push("Operations");
  if (tools.has("stripe") || /invoice|payment|refund|billing/.test(corpus)) areas.push("Finance");
  if (tools.has("hubspot") || tools.has("salesforce") || /book a demo|request a demo|contact sales/.test(corpus)) areas.push("Sales");
  if (!areas.length) areas.push("Operations");

  const likely = (LIKELY[industry] ?? [
    ["Support ticket response", "Customer Support", "Customers contact the company"],
    ["Weekly business reporting", "Operations", "Management reviews results weekly"],
  ]) as Array<[string, Department, string]>;
  return {
    name,
    summary,
    industry,
    employeeCount,
    country,
    currency: money.currency,
    hourlyCostEstimate: money.hourly,
    improvementAreas: [...new Set(areas)].slice(0, 4),
    customers: industry === "Marketplace" ? "Buyers and independent sellers" : null,
    likelyProcesses: likely.map(([title, department, why]) => ({ title, department, description: why, evidence: why })),
    evidence,
    confidence: industry === "Other" ? 0.4 : 0.7,
  };
}

function mockSuggestions(department: string, messages: InterviewMessage[], likely: Array<{ title: string; department: string }>): string[] {
  const answered = messages.filter((m) => m.role === "user").length;
  if (answered === 0) {
    const titles = likely.filter((l) => l.department === department).map((l) => l.title.toLowerCase());
    const list = titles.length ? titles : department === "Customer Support" ? ["answer tickets", "approve refunds"] : [`handle ${department.toLowerCase()} requests`, "prepare weekly reports"];
    return [
      list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0]!,
      department === "Customer Support" ? "Answer tickets, approve refunds, and review flagged listings" : `Prepare the weekly ${department.toLowerCase()} report`,
    ].filter((s, i, all) => all.indexOf(s) === i);
  }
  return ["About 300 a month, roughly 10 minutes each", "A few times a week, about half an hour each time", "That covers the main work"];
}
