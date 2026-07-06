import test from "node:test";
import assert from "node:assert/strict";

import { createPlantWithInitialPhoto } from "./createPlant.js";

function createPlantClient() {
  const calls = { inserts: 0 };
  const client = {
    from(table) {
      assert.equal(table, "plants");
      return {
        insert(plant) {
          calls.inserts += 1;
          return {
            select() {
              return {
                async single() {
                  return { data: { id: "new-plant", ...plant }, error: null };
                }
              };
            }
          };
        }
      };
    }
  };

  return { calls, client };
}

test("creating a plant without a photo does not call photo upload", async () => {
  const { calls, client } = createPlantClient();
  let uploadCalls = 0;

  const result = await createPlantWithInitialPhoto(
    client,
    { plant: { nickname: "Monstera" } },
    async () => {
      uploadCalls += 1;
    }
  );

  assert.equal(calls.inserts, 1);
  assert.equal(uploadCalls, 0);
  assert.equal(result.plant.id, "new-plant");
  assert.equal(result.photo, null);
});

test("creating a plant uploads one linked initial photo", async () => {
  const { client } = createPlantClient();
  const file = { name: "monstera.jpg", type: "image/jpeg", size: 2048 };
  let uploadOptions;

  const result = await createPlantWithInitialPhoto(
    client,
    { plant: { nickname: "Monstera" }, initialPhoto: file },
    async (_client, options) => {
      uploadOptions = options;
      return { id: "photo-id", image_url: "https://example.test/photo.jpg" };
    }
  );

  assert.deepEqual(uploadOptions, {
    plantId: "new-plant",
    file,
    archiveNote: "Initial plant photo added"
  });
  assert.equal(result.photo.id, "photo-id");
  assert.equal(result.photoUploadError, null);
});

test("a photo failure preserves the newly created plant", async () => {
  const { client } = createPlantClient();
  const uploadError = new Error("Storage unavailable");

  const result = await createPlantWithInitialPhoto(
    client,
    {
      plant: { nickname: "Monstera" },
      initialPhoto: { name: "plant.jpg", type: "image/jpeg", size: 2048 }
    },
    async () => {
      throw uploadError;
    }
  );

  assert.equal(result.plant.id, "new-plant");
  assert.equal(result.photo, null);
  assert.equal(result.photoUploadError, uploadError);
});
