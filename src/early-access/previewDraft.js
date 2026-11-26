// Private concept for review. This function does not call a model or send a message.
function createEarlyAccessPreviewDraft({ business_name, industry }) {
  const audience = {
    agency: "a small business evaluating external marketing support",
    ecommerce: "a shopper comparing products",
    professional_services: "a prospect comparing service providers",
    hospitality: "a guest planning a visit",
    product_brand: "a buyer comparing product options",
    other: "a new prospect evaluating the offer",
  }[industry];
  return {
    contract: "early-access-preview-draft.v1",
    status: "internal_review",
    provenance: "deterministic_fixture",
    businessName: business_name,
    slides: [
      { title: "Business and brand understanding", body: `For ${business_name}, explore what ${audience} needs to know. Confirm the offer, tone and proof points before writing claims.` },
      { title: "Marketing strategy", body: "Test one audience, one message and one call to action. Track visits and enquiries from the same campaign." },
      { title: "Example campaign", body: "Campaign concept: Start with the essentials. Show the problem, demonstrate one practical next step and invite a low-commitment enquiry." },
      { title: "Example social copy", body: `Exploring your options? ${business_name} can show you where to start. Share the one question you would like answered.` },
      { title: "Example creative concepts", body: "Try a three-panel checklist and a short walkthrough storyboard. Use placeholder imagery until assets have been approved." },
      { title: "Proposed content calendar", body: "Monday: checklist. Wednesday: walkthrough. Friday: audience Q&A and a review of visits and enquiries." },
      { title: "Early-access invitation", body: "Invitation draft for internal review. Confirm cohort eligibility and contact permission before inviting anyone." },
    ],
  };
}

module.exports = { createEarlyAccessPreviewDraft };
