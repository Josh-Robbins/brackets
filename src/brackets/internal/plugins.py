_plugins = []

def usePlugin(plugin):
    _plugins.append(plugin)
    return plugin

def _emit(name, *a, **kw):
    for p in _plugins:
        h = getattr(p, name, None)
        if callable(h):
            try:
                h(*a, **kw)
            except Exception as e:
                # plugin errors shouldn't crash the app
                pass
