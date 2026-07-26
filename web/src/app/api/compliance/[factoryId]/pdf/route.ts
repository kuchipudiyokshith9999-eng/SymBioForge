import { NextRequest, NextResponse } from "next/server"
import { getSyncedEngine } from "@/lib/server/synced-engine"
import { buildFormVPDFDocument, formVPDFFileName } from "@/lib/pdf-generator"

export async function GET(
  _request: NextRequest,
  { params }: { params: { factoryId: string } }
) {
  const engine = await getSyncedEngine()
  const factory = engine.getFactories().find((item) => item.id === params.factoryId)

  if (!factory) {
    return NextResponse.json(
      { error: `Factory not found: ${params.factoryId}` },
      { status: 404 }
    )
  }

  const doc = buildFormVPDFDocument(factory)
  const arrayBuffer = doc.output("arraybuffer")
  const filename = formVPDFFileName(factory)

  return new NextResponse(Buffer.from(arrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
