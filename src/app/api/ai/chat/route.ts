import { NextResponse } from "next/server";

const RETIRED_BODY = {
  error:
    "This assistant endpoint has been retired. Please submit a service request or enquiry through the FlowGuard portal.",
  retired: true,
};

export async function POST() {
  return NextResponse.json(RETIRED_BODY, { status: 410 });
}

export async function GET() {
  return NextResponse.json(RETIRED_BODY, { status: 410 });
}
