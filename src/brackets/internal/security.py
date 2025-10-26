from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from itsdangerous import URLSafeSerializer

CSRF_COOKIE = 'csrf'
CSRF_FORM = 'csrf'
CSRF_HEADER = 'X-CSRFToken'

class CSRFMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, secret: str = 'csrf-secret'):
        super().__init__(app)
        self.ser = URLSafeSerializer(secret, salt='brx.csrf')

    async def dispatch(self, request: Request, call_next):
        csrf = request.cookies.get(CSRF_COOKIE)
        if not csrf:
            csrf = self.ser.dumps('ok')
            request.state._issue_csrf = csrf
        if request.method in {'POST','PUT','PATCH','DELETE'}:
            token = request.headers.get(CSRF_HEADER)
            if token is None:
                try:
                    form = await request.form()
                    token = form.get(CSRF_FORM)
                except Exception:
                    token = None
            if not token or token != csrf:
                from fastapi.responses import PlainTextResponse
                return PlainTextResponse('CSRF failed', status_code=403)
        response: Response = await call_next(request)
        if getattr(request.state, '_issue_csrf', None):
            response.set_cookie(CSRF_COOKIE, csrf, httponly=True, samesite='lax')
        return response
