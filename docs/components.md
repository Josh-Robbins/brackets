# Components (.bxc)

Prefer single‑file components for a React feel.

```html
<!-- components/Counter.bxc -->
<script lang="python">
from brackets import Component
class Counter(Component):
    async def mount(self, props, state):
        n, _ = self.useState('n', 0); return {'n': n}
    async def increment(self):
        n, setN = self.useState('n', 0); setN(n+1)
</script>
<section>
  <button onClick={increment}>+1</button>
  <strong>{n}</strong>
</section>
```
