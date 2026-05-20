import { proxyChatRequest } from "../proxy";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return proxyChatRequest(request, true);
}
