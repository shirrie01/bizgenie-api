const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOOGLE_VEO_NORMAL_MODEL,
  GoogleVertexVeoProvider,
} = require("../src/video-generation/googleVeoProvider");

function operationName() {
  return `projects/bizgenie-backend/locations/us-central1/publishers/google/models/${GOOGLE_VEO_NORMAL_MODEL}/operations/op-test-001`;
}

function createProvider(calls) {
  return new GoogleVertexVeoProvider({
    projectId: "bizgenie-backend",
    outputStorageUri: "gs://bizgenie-backend-staging-veo-output/veo/",
    transport: {
      async post(url, body) {
        calls.push({ url, body });
        return { payload: { name: operationName() } };
      },
    },
  });
}

test("Veo text-to-video request omits obsolete task parameter", async () => {
  const calls = [];
  const provider = createProvider(calls);

  await provider.submit({
    prompt: "A cinematic product launch",
    quality: "normal",
    aspect_ratio: "16:9",
    duration_seconds: 4,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.instances, [
    { prompt: "A cinematic product launch" },
  ]);
  assert.equal(Object.hasOwn(calls[0].body.parameters, "task"), false);
});

test("Veo image-to-video mode is inferred from instance.image without task", async () => {
  const calls = [];
  const provider = createProvider(calls);

  await provider.submit({
    prompt: "Animate this image",
    quality: "normal",
    aspect_ratio: "16:9",
    duration_seconds: 4,
    input_image: {
      asset_id: "asset-1",
      location: "gs://example-bucket/image.jpg",
      mime_type: "image/jpeg",
    },
  });

  assert.deepEqual(calls[0].body.instances, [
    {
      prompt: "Animate this image",
      image: {
        gcsUri: "gs://example-bucket/image.jpg",
        mimeType: "image/jpeg",
      },
    },
  ]);
  assert.equal(Object.hasOwn(calls[0].body.parameters, "task"), false);
});

test("Veo reference-image mode is inferred from referenceImages without task", async () => {
  const calls = [];
  const provider = createProvider(calls);

  await provider.submit({
    prompt: "Use these reference assets",
    quality: "normal",
    aspect_ratio: "16:9",
    duration_seconds: 8,
    reference_assets: [
      {
        asset_id: "asset-1",
        location: "gs://example-bucket/reference.png",
        mime_type: "image/png",
      },
    ],
  });

  assert.deepEqual(calls[0].body.instances, [
    {
      prompt: "Use these reference assets",
      referenceImages: [
        {
          image: {
            gcsUri: "gs://example-bucket/reference.png",
            mimeType: "image/png",
          },
          referenceType: "asset",
        },
      ],
    },
  ]);
  assert.equal(Object.hasOwn(calls[0].body.parameters, "task"), false);
});
