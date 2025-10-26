# Example — Basic Counter

This example ships at `examples/basic-counter/` and runs with:

```bash
cd examples/basic-counter
brx dev app.app:app
```

- Server state lives in the session via `SessionMiddleware`.
- `<form onSubmit>` is compiled to htmx with `hx-post` and target `#app`,
  so the update is swapped in place without a full-page reload.
