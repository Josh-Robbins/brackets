# Templates (.bx)

Loops, conditionals, events.

```html
<ul>
  [for todos key id]
    <li>{.title}</li>
  [empty]
    <li class="muted">Nothing yet.</li>
  [/for]
</ul>
```
