import { uploadPlantPhoto } from "./plantPhotos.js";

export async function createPlantWithInitialPhoto(
  supabase,
  { plant, initialPhoto = null },
  uploadPhoto = uploadPlantPhoto
) {
  const { data: createdPlant, error } = await supabase
    .from("plants")
    .insert(plant)
    .select("*")
    .single();

  if (error) throw error;

  if (!initialPhoto) {
    return { plant: createdPlant, photo: null, photoUploadError: null };
  }

  try {
    const photo = await uploadPhoto(supabase, {
      plantId: createdPlant.id,
      file: initialPhoto,
      archiveNote: "Initial plant photo added"
    });

    return { plant: createdPlant, photo, photoUploadError: null };
  } catch (photoUploadError) {
    return { plant: createdPlant, photo: null, photoUploadError };
  }
}
