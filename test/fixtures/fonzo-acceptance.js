'use strict';
// FIXTURE ONLY (BG-FOUNDER-E2E-FINAL-01). A deterministic, non-billable Fonzo launch-week scenario.
// Facts are limited to what the founder supplied: UK sugar-free soft drinks, 330ml cans, and the campaign objectives.
// No flavours, prices, nutrition values, certifications, testimonials or retailers are asserted. No genuine Fonzo brand
// image assets were found in either repository, so every image/video is a deterministic placeholder (see `placeholders`).
const goal = 'Generate wholesale and retail stockist enquiries and build consumer brand awareness for Fonzo sugar-free soft drinks in 330ml cans, communicating flavour, value and product positioning to drive interest in stocking and purchasing Fonzo';
const brandBrain = Object.freeze({
  name: 'Fonzo',
  identity: { description: 'Fonzo is a UK sugar-free soft drinks brand sold in 330ml cans.', positioning: 'Sugar-free soft drinks in 330ml cans for UK shoppers and stockists.' },
  voice: { tone: 'Clear, upbeat and straightforward.' },
  audience: { summary: 'UK consumers, plus independent retailers, wholesalers and distributors who stock soft drinks.' },
  commercial: {
    primary_cta: 'Enquire about stocking Fonzo',
    approved_claims: ['Fonzo is a sugar-free soft drink', 'Fonzo is sold in 330ml cans'],
    prohibited_claims: ['No health or weight-loss claims', 'No nutritional claims beyond sugar-free', 'No retailer partnership claims'],
  },
});
const provisionalPrices = Object.freeze({ 'text.standard': 1, 'image.normal': 2, 'video.normal': 5 }); // staging.standard.v1; NOT commercially approved
const expected = Object.freeze({ posts: 7, contentItems: 8, images: 5, videos: 3, textGenerations: 0, provisionalCredits: 5 * 2 + 3 * 5 });
const placeholders = Object.freeze(['Fonzo logo and can imagery: not located in either repository; placeholder composition used', 'Product photography: none supplied', 'Enquiry destination: none supplied']);
module.exports = { goal, brandBrain, provisionalPrices, expected, placeholders, startDate: '2026-12-07' };
