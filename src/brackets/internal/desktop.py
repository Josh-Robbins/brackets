from threading import Thread
from time import sleep
import socket
from contextlib import suppress

def _free_port(start=12701):
    with socket.socket() as s:
        for p in range(start, start+200):
            with suppress(OSError):
                s.bind(("127.0.0.1", p)); return p
    raise RuntimeError("No free port")

def openWindow(app, *, title='Brackets App', width=1200, height=800):
    import uvicorn, webview
    port = _free_port()
    t = Thread(target=lambda: uvicorn.run(app, host='127.0.0.1', port=port, log_level='warning'), daemon=True)
    t.start(); sleep(0.4)
    win = webview.create_window(title, f"http://127.0.0.1:{port}", width=width, height=800)
    webview.start()
