const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { buildRecommendation, campaignTitle, goalKind } = require("../src/campaigns/goalRecommendation");

// BG-CL-008 F1/F2: coherent campaign titles and conversion-intent classification. Offline, deterministic, no provider call.
// Industries covered: property, vehicle leasing, aesthetics, hospitality, retail, consumer brands and trade.

const KINDS = {
  property: [
    ["Get more valuation requests from landlords", "lead"],
    ["Fill our vacant rental properties", "lead"],
    ["Increase instructions for sales and lettings in Bradford", "lead"],
    ["Book more property viewings", "lead"],
    ["Generate more landlord leads", "lead"],
    ["Get more enquiries for my residential lettings and sales", "lead"],
  ],
  "vehicle leasing": [
    ["Get more lease enquiries from local businesses", "lead"],
    ["Fill test drive slots for our new electric range", "lead"],
    ["Generate more quote requests for van leasing", "lead"],
    ["Promote our new electric vehicle range", "awareness"],
  ],
  aesthetics: [["Get more consultation bookings for lip filler treatments", "lead"]],
  hospitality: [
    ["Fill tables for Friday dinner", "lead"],
    ["More bookings for the spa in December", "lead"],
    ["Promote our Christmas set menu", "awareness"],
    ["Announce our grand opening this Saturday", "launch"],
  ],
  retail: [
    ["Run a weekend sale on winter coats", "offer"],
    ["Clear last season's stock with a discount", "offer"],
    ["Drive footfall to our new shop in Leeds", "awareness"],
  ],
  "consumer brand": [
    ["Build awareness of our new flavour", "awareness"],
    ["Promote our new soft drink flavour to cafes", "awareness"],
    // Regression: the bare word "businesses" used to force a lead goal onto a consumer awareness goal.
    ["Help local businesses discover our new cafe", "awareness"],
  ],
  trade: [["Reach more retailers and distributors", "lead"]],
};
const ALL_GOALS = Object.values(KINDS).flat().map(([goal]) => goal);
const DANGLING = /\b(a|an|and|as|at|but|by|for|from|in|into|of|on|or|per|the|to|via|with|my|our|your|their|its|this|that|these|those|some|any|all|more|most|new|other|local)$/i;
const stem = (title) => title.replace(/ Campaign$/, "");

describe("goal classification follows the conversion objective (F2)", () => {
  for (const [industry, rows] of Object.entries(KINDS)) {
    for (const [goal, kind] of rows) {
      it(`${industry}: "${goal}" is ${kind}`, () => assert.equal(goalKind(goal, {}), kind));
    }
  }

  it("keeps the earlier behaviour: the saved Brand Brain call to action still counts", () => {
    assert.equal(goalKind("Grow our brand", { commercial: { primary_cta: "Book a viewing" } }), "lead");
    assert.equal(goalKind("Grow our brand", {}), "awareness");
  });

  it("order is unchanged: trade, then launch, then offer, then lead", () => {
    assert.equal(goalKind("Launch our new range to retailers", {}), "lead");
    assert.equal(goalKind("Grand opening offer: book a table", {}), "launch");
    assert.equal(goalKind("Weekend offer to fill tables", {}), "offer");
  });
});

describe("campaign titles are complete phrases (F1)", () => {
  it("the four reproduced titles are fixed", () => {
    assert.equal(campaignTitle("Get more valuation requests from landlords"), "Get More Valuation Requests from Landlords Campaign");
    assert.equal(campaignTitle("Get more enquiries for my residential lettings and sales"), "Get More Enquiries for My Residential Lettings and Sales Campaign");
    assert.equal(campaignTitle("Increase instructions for sales and lettings in Bradford"), "Increase Instructions for Sales and Lettings in Bradford Campaign");
    assert.equal(campaignTitle("Promote our new soft drink flavour to cafes"), "Promote Our New Soft Drink Flavour to Cafes Campaign");
  });

  it("every industry goal yields a title of at most 200 code points that never ends on a connecting word", () => {
    for (const goal of ALL_GOALS) {
      const title = campaignTitle(goal);
      assert.ok(title.length > 0 && [...title].length <= 200, `${goal} -> ${title} (${title.length})`);
      assert.match(title, / Campaign$/, title);
      assert.doesNotMatch(stem(title), DANGLING, `${goal} -> ${title}`);
    }
  });

  it("a short goal is kept whole", () => {
    assert.equal(campaignTitle("More leads"), "More Leads Campaign");
    assert.equal(campaignTitle("Book more property viewings"), "Book More Property Viewings Campaign");
  });

  it("a long goal is cut at a word boundary and never mid-phrase", () => {
    const title = campaignTitle("Get more valuation requests from landlords and homeowners across Greater Manchester and the north west");
    assert.ok([...title].length <= 200, title);
    assert.doesNotMatch(stem(title), DANGLING, title);
    assert.equal(title, "Get More Valuation Requests from Landlords and Homeowners Across Greater Manchester and the North West Campaign");
    const huge = campaignTitle("x".repeat(200));
    assert.ok([...huge].length <= 200, huge.length);
    assert.doesNotMatch(huge, /\s$/);
  });

  it("handles punctuation, capitals, currency, acronyms, contractions and an existing 'campaign'", () => {
    assert.equal(campaignTitle("Get more leads!!!"), "Get More Leads Campaign");
    assert.equal(campaignTitle("  GET   MORE   LEADS  "), "Get More Leads Campaign");
    assert.equal(campaignTitle("Promote our £99 plan to freelancers"), "Promote Our £99 Plan to Freelancers Campaign");
    assert.equal(campaignTitle("Get SM Properties more enquiries"), "Get SM Properties More Enquiries Campaign");
    assert.equal(campaignTitle("Clear last season's stock with a discount"), "Clear Last Season's Stock with a Discount Campaign");
    assert.equal(campaignTitle("Black Friday campaign for our shop"), "Black Friday Campaign for Our Shop");
    assert.equal(campaignTitle("Get more 🏠 viewings"), "Get More 🏠 Viewings Campaign");
  });

  it("unsupported input degrades safely", () => {
    assert.equal(campaignTitle("!!!"), "Your Campaign");
    assert.equal(campaignTitle(""), "Your Campaign");
    assert.equal(campaignTitle(undefined), "Your Campaign");
  });
});

describe("recommendations keep their structure (no second engine)", () => {
  const context = { tenant_id: "t", project_id: "p", brand_id: "b", brand_brain: {} };
  let n = 0;
  const make = (goal) => buildRecommendation({
    context, request: { goal, brand_id: "b", display_timezone: "Europe/London" },
    now: () => new Date("2026-11-09T10:00:00Z"), idFactory: () => `rec_${n++}`,
  });

  it("strategy titles are unchanged (trade, clinic)", () => {
    assert.equal(make("Reach more retailers and distributors").campaign_name, "Trade stockist acquisition");
    assert.equal(make("Fill December appointment slots at our aesthetics clinic").campaign_name, "Clinic appointment enquiries");
  });

  it("the created campaign carries the same name as the recommendation heading", () => {
    for (const goal of ALL_GOALS) {
      const rec = make(goal);
      assert.equal(rec.create_campaign_payload.name, rec.campaign_name);
      assert.equal(rec.create_campaign_payload.goal, goal);
      assert.equal(rec.suggested_items.length, 3);
    }
  });

  it("property goals get the lead item set (enquiry post, credibility post, follow-up e-mail), consumer goals do not", () => {
    for (const goal of ["Get more valuation requests from landlords", "Fill our vacant rental properties", "Increase instructions for sales and lettings in Bradford"]) {
      const rec = make(goal);
      assert.equal(rec.recommendation_kind, "lead", goal);
      assert.deepEqual(rec.suggested_items.map((i) => i.name), ["Property information explainer", "Property enquiry post", "Consent-based property follow-up"], goal);
    }
    assert.deepEqual(make("Build awareness of our new flavour").suggested_items.map((i) => i.name), ["Brand awareness post", "Facebook story post", "Simple email update"]);
  });

  it("no recommendation text mentions an unrelated industry (no drinks wording for a property goal)", () => {
    const rec = make("Get more valuation requests from landlords");
    assert.doesNotMatch(JSON.stringify(rec), /drink|beverage|cocktail|fonzo|flavour/i);
  });
});

// BG-EXEC-009: retain location/intent from both implementations; no provider or inferred property facts.
describe("reconciled campaign contract", () => {
  const make = goal => buildRecommendation({context:{tenant_id:"t",project_id:"p",brand_id:"b",brand_brain:{}},request:{goal,brand_id:"b",display_timezone:"Europe/London"},now:()=>new Date("2026-11-09T10:00:00Z"),idFactory:()=>"rec_once"});
  it("keeps booking locations and property locations in natural titles", () => {
    for (const goal of ["Get more bookings for our spa in Bradford", "Increase instructions for sales and lettings in Bradford", "Get more valuation requests from landlords in Leeds"]) {
      const r=make(goal);assert.equal(r.recommendation_kind,"lead");assert.match(r.campaign_name,/Bradford|Leeds/);assert.equal(r.create_campaign_payload.goal,goal);assert.equal(r.create_campaign_payload.name,r.campaign_name);assert.equal(r.create_campaign_payload.display_timezone,"Europe/London");
    }
  });
  it("retains specific property items without importing bridge activation", () => {
    const r=make("Get more enquiries for vacant rental property");assert.equal(r.recommendation_kind,"lead");assert.match(r.suggested_items[0].name,/Property/);assert.doesNotMatch(JSON.stringify(r),/guaranteed|Northgate|£/);
  });
  it("Unicode title boundaries match the existing campaign name schema", () => {
    const {name}=require("../src/campaigns/schema");
    const title=campaignTitle("🏠".repeat(200));assert.equal(name.safeParse(title).success,true);assert.equal(title.isWellFormed(),true);assert.ok([...title].length<=200);
  });
});
