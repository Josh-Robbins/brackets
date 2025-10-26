import asyncio
from typing import Dict
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

_channels: Dict[str, asyncio.Queue[str]] = {}

async def _publisher(channel: str):
    q = _channels.setdefault(channel, asyncio.Queue())
    while True:
        msg = await q.get()
        yield f"data: {msg}\n\n"

async def broadcast(channel: str, message: str):
    q = _channels.setdefault(channel, asyncio.Queue())
    await q.put(message)

_router = APIRouter()

@_router.get('/bx/sse')
async def sse(to: str):
    gen = _publisher(to)
    return StreamingResponse(gen, media_type='text/event-stream')

def mount_sse(app):
    app.include_router(_router)
