import OpenAI from "openai";

export default async function ChatGPTPage() {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.responses.create({
    model: "gpt-5-nano",
    input: "Buatkan sebuah cerita singkat menggunakan GPT-5-nano",
  });

  return (
    <div className="p-4">
      <h1>ChatGPT Test</h1>
      <pre>{response.output_text}</pre>
    </div>
  );
}
