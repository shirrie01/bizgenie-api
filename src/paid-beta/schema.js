const { z } = require("zod");
const { PaidBetaValidationError } = require("./errors");

const PAID_BETA_STAGES = Object.freeze([
  "pre-revenue",
  "under-250k",
  "250k-1m",
  "1m-5m",
  "5m-plus",
]);

const boundedText = (maximum) => z.string().trim().min(1).max(maximum);
const httpUrl = z.string().trim().min(1).max(2048).url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Website or social profile must be an HTTP(S) URL");

const PaidBetaSubmissionSchema = z.object({
  name: boundedText(120),
  work_email: z.string().trim().max(254).transform((value) => value.toLowerCase())
    .pipe(z.string().email().max(254)),
  business_name: boundedText(160),
  website_or_social_profile: httpUrl,
  business_stage: z.enum(PAID_BETA_STAGES),
  primary_marketing_challenge: boundedText(1000),
  privacy_contact_consent: z.literal(true),
  source: z.string().trim().toLowerCase().min(1).max(64)
    .regex(/^[a-z0-9][a-z0-9._:-]*$/),
  submission_id: z.string().trim().min(1).max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
}).strict();

function validationDetails(issues) {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
  }));
}

function parsePaidBetaSubmission(value) {
  const result = PaidBetaSubmissionSchema.safeParse(value);
  if (!result.success) {
    throw new PaidBetaValidationError(validationDetails(result.error.issues));
  }
  return result.data;
}

module.exports = {
  PAID_BETA_STAGES,
  PaidBetaSubmissionSchema,
  parsePaidBetaSubmission,
  validationDetails,
};
