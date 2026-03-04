import OpenAI from 'openai'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return client
}

export async function embedText(text: string): Promise<number[]> {
  const openai = getClient()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
    dimensions: 1536,
  })
  return response.data[0]!.embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const openai = getClient()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: texts,
    dimensions: 1536,
  })
  return response.data.map((d) => d.embedding)
}
