import http from "@/lib/http";

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
