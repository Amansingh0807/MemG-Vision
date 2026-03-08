import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    // The C++ exe runs in the project root, while Next.js runs in frontend/
    const logPath = path.join(process.cwd(), '../memguard_history.jsonl')
    
    if (!fs.existsSync(logPath)) {
      return NextResponse.json({ events: [] })
    }

    const content = fs.readFileSync(logPath, 'utf8')
    const events = content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .reverse() // Newest first

    return NextResponse.json({ events })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
