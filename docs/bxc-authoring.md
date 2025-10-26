# .bxc Single‑File Components (SFC)

Write template + logic in one file for a React‑like feel.

> **Status:** Authoring format is documented here; the current runtime
> example uses `.bx` + routes. The `.bxc` compiler is on the roadmap;
> use split or inline for now if you need production today.

**components/Counter.bxc**

```html
<script lang="python">
from brackets import Component
class Counter(Component):
    async def mount(self, props, state):
        n, _ = self.useState('n', 0); return { 'n': n }
    async def increment(self):
        n, setN = self.useState('n', 0); setN(n+1)
</script>

<section>
  <button onClick={increment}>+1</button>
  <strong>{n}</strong>
</section>
```

**Usage in a page**

```html
<Counter key="hero"/>
```
