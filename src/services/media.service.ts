import http from "@/lib/http";

export interface VehicleMedia {
  media_id: number;
  media_name: string;
  media_description: string;
  media_type: string;
  media_reference_type: string;
  media_reference_id: number;
  media_url: string;
  updated_at?: string;
  updated_by?: number;
}

const mediaApi = {
  upload: (formData: FormData) =>
    http.post("/media", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  getByReference: (type: string, id: number) =>
    http.get("/media", {
      params: { media_reference_type: type, media_reference_id: id },
    }),
  delete: (id: number) => http.delete(`/media/${id}`),
};

export default mediaApi;
