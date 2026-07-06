export const PLANT_PHOTO_BUCKET = "plant-photos";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function photoPath(plantId, file, id) {
  return `${plantId}/${id}-${safeFileName(file.name || "plant-photo")}`;
}

export function validatePlantPhoto(file) {
  if (!file || !ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new TypeError("Choose a JPEG, PNG, WebP, HEIC, or HEIF image.");
  }
  if (file.size > MAX_PHOTO_SIZE) {
    throw new TypeError("Choose an image smaller than 10 MB.");
  }
}

export async function listPlantPhotos(supabase, plantId) {
  const { data, error } = await supabase
    .from("plant_photos")
    .select("*")
    .eq("plant_id", plantId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function uploadPlantPhoto(
  supabase,
  {
    plantId,
    file,
    archiveNote = "Photo added",
    now = new Date().toISOString(),
    id = crypto.randomUUID()
  }
) {
  validatePlantPhoto(file);
  const path = photoPath(plantId, file, id);
  const storage = supabase.storage.from(PLANT_PHOTO_BUCKET);
  const { error: uploadError } = await storage.upload(path, file, {
    contentType: file.type,
    upsert: false
  });
  if (uploadError) {
    throw new Error(`Photo storage upload failed: ${uploadError.message}`, {
      cause: uploadError
    });
  }

  const { data: publicUrlData } = storage.getPublicUrl(path);
  if (!publicUrlData?.publicUrl) {
    throw new Error("Photo storage upload succeeded, but no public URL was returned.");
  }

  const { data: photo, error: photoError } = await supabase
    .from("plant_photos")
    .insert({
      plant_id: plantId,
      image_url: publicUrlData.publicUrl,
      taken_at: now,
      ai_status: null,
      ai_summary: null,
      ai_suggestions: null
    })
    .select("*")
    .single();
  if (photoError) {
    throw new Error(`Saving the plant photo record failed: ${photoError.message}`, {
      cause: photoError
    });
  }

  const { error: eventError } = await supabase.from("plant_events").insert({
    plant_id: plantId,
    photo_id: photo.id,
    event_type: "photo",
    title: archiveNote,
    notes: archiveNote,
    event_date: now.slice(0, 10),
    status: "completed",
    priority: "low",
    due_date: now.slice(0, 10),
    completed_at: now,
    created_at: now
  });
  if (eventError) {
    throw new Error(`Saving the photo archive event failed: ${eventError.message}`, {
      cause: eventError
    });
  }

  return photo;
}
