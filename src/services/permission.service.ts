import http from "@/lib/http";

const permissionApi = {
  getPermissions: () => http.get<Record<string, string[]>>("/permissions"),
  updatePermissions: (data: Record<string, string[]>) => http.put("/permissions", data),
};

export default permissionApi;
