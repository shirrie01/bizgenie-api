const { randomUUID } = require("node:crypto");
const express = require("express");
const {
  CreateFindingSchema,
  CreateReviewSchema,
  FindingSchema,
  ReviewSchema,
} = require("./schemas");
const {
  ReviewNotFoundError,
  ValidationError,
  formatZodIssues,
  sendMissionControlError,
} = require("./errors");

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(formatZodIssues(result.error.issues));
  }
  return result.data;
}

function createMissionControlRouter({
  repository,
  idFactory = randomUUID,
  now = () => new Date(),
}) {
  if (!repository) {
    throw new Error("A Mission Control repository is required");
  }

  const router = express.Router();

  router.post("/reviews", (req, res, next) => {
    try {
      const input = parse(CreateReviewSchema, req.body);
      const review = parse(ReviewSchema, {
        ...input,
        review_id: input.review_id || `review_${idFactory()}`,
        created_at: input.created_at || now().toISOString(),
      });

      return res.status(201).json({
        review: repository.createReview(review),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/reviews/:reviewId", (req, res, next) => {
    try {
      const review = repository.getReview(req.params.reviewId);
      if (!review) {
        throw new ReviewNotFoundError(req.params.reviewId);
      }
      return res.json({ review });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/reviews/:reviewId/findings", (req, res, next) => {
    try {
      const input = parse(CreateFindingSchema, req.body);
      if (input.review_id && input.review_id !== req.params.reviewId) {
        throw new ValidationError([
          {
            path: "review_id",
            code: "custom",
            message: "review_id must match the reviewId route parameter",
          },
        ]);
      }

      if (!repository.getReview(req.params.reviewId)) {
        throw new ReviewNotFoundError(req.params.reviewId);
      }

      const finding = parse(FindingSchema, {
        ...input,
        finding_id: input.finding_id || `finding_${idFactory()}`,
        review_id: req.params.reviewId,
        created_at: input.created_at || now().toISOString(),
      });

      return res.status(201).json({
        finding: repository.addFinding(finding),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/reviews/:reviewId/findings", (req, res, next) => {
    try {
      return res.json({
        findings: repository.listFindings(req.params.reviewId),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.use((error, _req, res, next) => {
    if (sendMissionControlError(error, res)) {
      return;
    }
    next(error);
  });

  return router;
}

module.exports = {
  createMissionControlRouter,
};
