import asyncio
from openai import AsyncOpenAI
import os
from dotenv import load_dotenv

load_dotenv()

async def test():
    c = AsyncOpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url="https://api.deepseek.com",
        timeout=15.0
    )
    print("Conectando a DeepSeek...")
    r = await c.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": "Di hola en una palabra"}],
        max_tokens=10
    )
    print("OK:", r.choices[0].message.content)

asyncio.run(test())
