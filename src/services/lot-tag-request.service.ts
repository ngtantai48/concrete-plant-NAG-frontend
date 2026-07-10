import http from "@/lib/http";
import {
  normalizeLotTagRequest,
  normalizeLotTagRequestList,
  type ListLotTagRequestParams,
  type ListLotTagRequests,
  type LotTagRequest,
  type LotTagRequestStatus,
  type LotTagRequestWorkflowAction,
} from "@/services/lot-tag-request-workflow";

export type {
  ListLotTagRequestParams,
  ListLotTagRequests,
  LotTagRequest,
  LotTagRequestStatus,
  LotTagRequestWorkflowAction,
} from "@/services/lot-tag-request-workflow";

export interface CreateLotTagRequestPayload {
  work_date: string;
  vehicle_id: number;
  lot_tag_id?: number | null;
  lot_tag_key: string;
  request_reason?: string | null;
}

export interface ReviewLotTagRequestPayload {
  note?: string | null;
  reason?: string | null;
}

const LOT_TAG_REQUESTS_ENDPOINT = "/lot-tags/requests";

const normalizeItemPayload = (payload: unknown): LotTagRequest => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return normalizeLotTagRequest((payload as { data: unknown }).data);
  }
  return normalizeLotTagRequest(payload);
};

const normalizeParams = (params?: ListLotTagRequestParams) => {
  if (!params) return undefined;
  const { status, ...rest } = params;
  return {
    ...rest,
    ...(status && status !== "all" ? { status } : {}),
  };
};

const lotTagRequestApi = {
  list: async (params?: ListLotTagRequestParams): Promise<ListLotTagRequests> => {
    const res = await http.get(LOT_TAG_REQUESTS_ENDPOINT, { params: normalizeParams(params) });
    return normalizeLotTagRequestList(res.data, params);
  },

  create: async (payload: CreateLotTagRequestPayload): Promise<LotTagRequest> => {
    const res = await http.post(LOT_TAG_REQUESTS_ENDPOINT, payload);
    return normalizeItemPayload(res.data);
  },

  approve: async (
    requestId: number,
    payload?: ReviewLotTagRequestPayload
  ): Promise<LotTagRequest> => {
    const res = await http.post(`${LOT_TAG_REQUESTS_ENDPOINT}/${requestId}/approve`, {
      note: payload?.note ?? null,
    });
    return normalizeItemPayload(res.data);
  },

  reject: async (
    requestId: number,
    payload?: ReviewLotTagRequestPayload
  ): Promise<LotTagRequest> => {
    const res = await http.post(`${LOT_TAG_REQUESTS_ENDPOINT}/${requestId}/reject`, {
      reason: payload?.reason || payload?.note || "",
    });
    return normalizeItemPayload(res.data);
  },

  cancel: async (
    requestId: number,
    payload?: ReviewLotTagRequestPayload
  ): Promise<LotTagRequest> => {
    const res = await http.post(`${LOT_TAG_REQUESTS_ENDPOINT}/${requestId}/cancel`, {
      reason: payload?.reason || payload?.note || "",
    });
    return normalizeItemPayload(res.data);
  },

  remove: async (requestId: number): Promise<void> => {
    await http.delete(`${LOT_TAG_REQUESTS_ENDPOINT}/${requestId}`);
  },
};

export default lotTagRequestApi;
