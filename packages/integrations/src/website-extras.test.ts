import { describe, expect, it } from "vitest";
import { bundleCopy, chunkName, chunkUrls, isScriptRendered, mentionedTools, sitemapUrls } from "./website-extras";

describe("mentionedTools", () => {
  it("finds tools a site names or shows as logos", () => {
    const found = mentionedTools([
      { where: "Engineering team page", text: "Jira, Google BigQuery, Looker, Figma", strength: "logo" },
      { where: "Careers page", text: "Our data team works in BigQuery and Looker every day." },
    ]);
    expect(found.map((m) => m.key).sort()).toEqual(["figma", "googlebigquery", "jira", "looker"]);
    expect(found.find((m) => m.key === "jira")?.strength).toBe("logo");
  });

  it("ignores everyday words unless they sit in a list of tools", () => {
    expect(mentionedTools([{ where: "home", text: "Growth is linear and every segment matters. Square one." }])).toEqual([]);
    expect(mentionedTools([{ where: "home", text: "We plan in Linear and track in Segment" }]).map((m) => m.key)).toEqual([]);
    expect(
      mentionedTools([{ where: "stack", text: "We use Linear, Notion and Slack." }])
        .map((m) => m.key)
        .sort(),
    ).toEqual(["linear", "notion", "slack"]);
  });

  it("does not count a footer link to a social profile as a tool", () => {
    expect(mentionedTools([{ where: "home", text: "Follow us on LinkedIn" }])).toEqual([]);
  });
});

describe("single-page apps", () => {
  it("recognises a site that renders in the browser", () => {
    expect(isScriptRendered('<div id="root"></div><script type="module" src="/assets/index-a1b2c3d4.js"></script>', "")).toBe(true);
    expect(isScriptRendered("<main>…</main>", "A long page ".repeat(60))).toBe(false);
  });

  it("finds code-split chunks and names them", () => {
    const js = 'import("./CareerTeam-B54b5tJB.js");const a=["assets/OurStrategy-Cce-A7a0.js"]';
    const urls = chunkUrls(js, "https://acme.test/assets/index-T4M8tntH.js");
    expect(urls).toContain("https://acme.test/assets/CareerTeam-B54b5tJB.js");
    expect(urls).toContain("https://acme.test/assets/OurStrategy-Cce-A7a0.js");
    expect(chunkName("https://acme.test/assets/CareerTeam-B54b5tJB.js")).toBe("CareerTeam");
  });

  it("reads copy and logo names out of a bundle, not code or class lists", () => {
    const js = `const t={title:"Jira",slug:"jira"};e("h2",{className:"flex items-center gap-2 text-sm"},"Build the marketplaces that get pets home safely");throw Error("Exponent out of range:");var x="function(){return a}"`;
    const { text, logos } = bundleCopy(js);
    expect(logos).toEqual(["Jira"]);
    expect(text).toBe("Build the marketplaces that get pets home safely");
  });
});

describe("sitemapUrls", () => {
  it("reads pages and child sitemaps", () => {
    expect(sitemapUrls("<urlset><url><loc>https://a.test/about</loc></url></urlset>").pages).toEqual(["https://a.test/about"]);
    expect(sitemapUrls("<sitemapindex><sitemap><loc>https://a.test/pages.xml</loc></sitemap></sitemapindex>").sitemaps).toEqual(["https://a.test/pages.xml"]);
  });
});
