from fastapi import APIRouter, Request

_events_router = APIRouter()

@_events_router.post('/bx/event')
async def event_sink(request: Request):
    data = await request.form()
    return {"ok": True}

def mount_events(app):
    app.include_router(_events_router)
