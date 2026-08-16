import { NextResponse } from "next/server"
import { getLifeOSFileCount, getLifeOSFileList } from "@/lib/LifeOS-data"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const count = getLifeOSFileCount()
    const files = getLifeOSFileList()

    return NextResponse.json({
      count,
      files,
    })
  } catch (error) {
    console.error("Error getting file count:", error)
    return NextResponse.json(
      { error: "Failed to get file count" },
      { status: 500 }
    )
  }
}
