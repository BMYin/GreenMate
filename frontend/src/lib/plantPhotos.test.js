import test from "node:test";
import assert from "node:assert/strict";

import {
  listPlantPhotos,
  uploadPlantPhoto,
  validatePlantPhoto
} from "./plantPhotos.js";

function createSupabaseMock({ storageError = null, photoError = null } = {}) {
  const calls = { uploaded: null, photo: null, event: null };
  const photo = {
    id: "photo-id",
    plant_id: "plant-id",
    image_url: "https://example.test/plant-photo.jpg",
    created_at: "2026-07-02T09:00:00Z"
  };

  return {
    calls,
    client: {
      storage: {
        from() {
          return {
            async upload(path, file, options) {
              calls.uploaded = { path, file, options };
              return { error: storageError };
            },
            getPublicUrl() {
              return { data: { publicUrl: photo.image_url } };
            }
          };
        }
      },
      from(table) {
        if (table === "plant_photos") {
          return {
            insert(payload) {
              calls.photo = payload;
              return {
                select() {
                  return {
                    async single() {
                      return { data: photoError ? null : photo, error: photoError };
                    }
                  };
                }
              };
            },
            select() {
              return {
                eq() {
                  return {
                    async order() {
                      return { data: [photo], error: null };
                    }
                  };
                }
              };
            }
          };
        }

        return {
          async insert(payload) {
            calls.event = payload;
            return { error: null };
          }
        };
      }
    }
  };
}

test("upload stores a photo and links a completed archive event", async () => {
  const { client, calls } = createSupabaseMock();
  const file = { name: "Growth Photo.JPG", type: "image/jpeg", size: 2048 };
  const now = "2026-07-02T09:00:00Z";
  const photo = await uploadPlantPhoto(client, {
    plantId: "plant-id",
    file,
    now,
    id: "upload-id"
  });

  assert.equal(calls.uploaded.path, "plant-id/upload-id-growth-photo.jpg");
  assert.equal(calls.photo.ai_status, null);
  assert.equal(calls.photo.ai_summary, null);
  assert.equal(calls.event.photo_id, photo.id);
  assert.equal(calls.event.event_type, "photo");
  assert.equal(calls.event.status, "completed");
  assert.equal(calls.event.notes, "Photo added");
});

test("initial upload creates one linked initial-photo archive event", async () => {
  const { client, calls } = createSupabaseMock();

  await uploadPlantPhoto(client, {
    plantId: "plant-id",
    file: { name: "first.jpg", type: "image/jpeg", size: 2048 },
    archiveNote: "Initial plant photo added",
    now: "2026-07-02T09:00:00Z",
    id: "initial-upload"
  });

  assert.equal(calls.event.title, "Initial plant photo added");
  assert.equal(calls.event.notes, "Initial plant photo added");
  assert.equal(calls.event.photo_id, "photo-id");
});

test("photo listing survives reload through plant_photos", async () => {
  const { client } = createSupabaseMock();
  const photos = await listPlantPhotos(client, "plant-id");

  assert.equal(photos.length, 1);
  assert.equal(photos[0].id, "photo-id");
});

test("photo validation rejects non-images", () => {
  assert.throws(
    () => validatePlantPhoto({ name: "notes.txt", type: "text/plain", size: 12 }),
    /Choose a JPEG/
  );
});

test("storage failures identify the failed upload stage", async () => {
  const { client } = createSupabaseMock({
    storageError: { message: "Bucket policy denied the upload" }
  });

  await assert.rejects(
    uploadPlantPhoto(client, {
      plantId: "new-plant-id",
      file: { name: "first.jpg", type: "image/jpeg", size: 2048 },
      id: "upload-id"
    }),
    /Photo storage upload failed: Bucket policy denied the upload/
  );
});

test("plant_photos insert failures are surfaced with their database message", async () => {
  const { client, calls } = createSupabaseMock({
    photoError: { message: "new row violates row-level security policy" }
  });

  await assert.rejects(
    uploadPlantPhoto(client, {
      plantId: "new-plant-id",
      file: { name: "first.jpg", type: "image/jpeg", size: 2048 },
      id: "upload-id"
    }),
    /Saving the plant photo record failed: new row violates row-level security policy/
  );
  assert.equal(calls.photo.plant_id, "new-plant-id");
});
