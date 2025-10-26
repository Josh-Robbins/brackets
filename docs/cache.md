# Caching

```python
from brackets import cache, invalidate

@cache(30, tags=['news'])
def news(): ...
invalidate(tags=['news'])
```
Enable Redis:
```
pip install "brackets[cache]"
```
