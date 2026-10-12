// Deterministic, evidence-honest recommendation planning. No model/provider calls.
function planRecommendation(goal, brandBrain = {}) {
  const text = goal.toLowerCase();
  const trade = /\b(retailer|retailers|stockist|stockists|trade account|wholesale|distributor|convenience shop|convenience store)\b/.test(text);
  const clinic = /\b(clinic|aesthetic|facial|hydrafacial|treatment|appointment)\b/.test(text);
  const area = /greater manchester/i.test(goal) ? "Greater Manchester" : /birmingham/i.test(goal) ? "Birmingham" : null;
  if (trade) {
    const audience = /independent/i.test(text) && /convenience/i.test(text) ? "independent convenience retailers" : "prospective trade stockists";
    const location = area ? ` in ${area}` : "";
    return {
      kind: "trade",
      title: "Trade stockist acquisition",
      summary: `Acquire qualified ${audience}${location} through a trade-account enquiry journey. Confirm eligibility, portfolio availability and trade terms before publishing an offer.`,
      explanation: "Prioritise targeted, permission-compliant retailer outreach and a clear trade enquiry route; LinkedIn can support credibility but is not assumed to be the strongest channel for independent local shops. Funnel: targeted retailer → enquiry → qualified trade lead → approved account → first order. Track qualified enquiries, account applications, opened accounts and first orders; measure conversion rates only once real denominators exist. No response rates or acquisition costs are assumed.",
      reasons: [
        "Use LinkedIn selectively for credibility with wholesale buyers and distribution partners, not as a substitute for direct local retailer outreach.",
        "Use local Facebook content to explain stocking suitability and direct interested shop owners to the verified trade enquiry route; confirm audience targeting before spending.",
        "Prioritise permission-compliant direct retailer outreach with a specific enquiry CTA; do not promise wholesale prices, margins or delivery coverage until approved."
      ],
      gaps: "Confirm the live trade enquiry destination, minimum order, delivery area, available brands and approved trade terms before execution."
    };
  }
  if (clinic) {
    return {
      kind: "clinic",
      title: "Clinic appointment enquiries",
      summary: `Generate qualified treatment consultation or appointment enquiries${area ? ` in ${area}` : ""} with accurate service descriptions, eligibility and a verified booking route.`,
      explanation: "Funnel: service discovery → informed enquiry → suitability assessment → confirmed booking → attended appointment. Measure qualified enquiries, booking conversions and attended appointments without inventing results. Treatment claims, imagery and offers require clinic approval; avoid guaranteed outcomes.",
      reasons: [
        "Use a factual service explainer that sets expectations and directs prospects to an approved consultation route, avoiding unverified efficacy claims.",
        "Use a locally relevant awareness post with an accurate booking or enquiry action; confirm the clinic's approved claims and location.",
        "Use consent-based follow-up to answer practical appointment questions; do not assume consent or send unsolicited medical marketing."
      ],
      gaps: "Confirm approved treatment descriptions, booking URL, practitioner credentials, geographic catchment and claims policy."
    };
  }
  return null;
}
module.exports = { planRecommendation };
