# waypoints

Pin memories on an interactive map.

## Running it

```sh
npm run dev     # static server on http://localhost:5173
npm test        # node --test tests/
```

No build step and no runtime dependencies — `npm run dev` just serves the files as they
are on disk.

## After cloning

Enable the repo's git hooks:

```sh
git config core.hooksPath .githooks
```

`core.hooksPath` is local git config, so it cannot be committed and every clone has to set
it once. The `commit-msg` hook strips AI attribution trailers from commit messages.
