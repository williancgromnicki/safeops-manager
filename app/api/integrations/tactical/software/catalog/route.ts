import { NextResponse } from "next/server";
import { SOFTWARE_WHITELIST } from "@/lib/software-whitelist";

export async function GET() {
  return NextResponse.json({
    ok: true,
    software: SOFTWARE_WHITELIST.map((item) => ({
      key: item.key,
      label: item.label,
      category: item.category,
      attentionNote: item.attentionNote ?? null,
    })),
  });
}
