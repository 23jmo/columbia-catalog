# Superset workspace config

Automates workspace lifecycle for [Superset](https://docs.superset.sh/setup-teardown-scripts).

| File | When it runs |
| --- | --- |
| `setup.sh` | Workspace creation — copies untracked local files, `npm ci`, reserves a port |
| `run.sh` | Run button — starts `next dev` on this workspace's port |
| `teardown.sh` | Workspace deletion — stops the dev server, releases the port |
| `lib/ports.sh` | Shared port-allocation helpers |

## Ports

Superset doesn't assign port ranges, so parallel workspaces would all fight over
Next.js' default 3000. Instead, each workspace reserves its own port from
`~/.superset/port-allocations.tsv` (a machine-wide `port -> workspace` registry) and
caches it in `.superset/.port`.

- Ports are handed out from **3001** upward; **3000 is left free for the main checkout**.
- Allocation is guarded by a lock, so simultaneous workspace creations can't collide.
- Reservations for deleted workspace directories are pruned automatically, so a
  force-deleted workspace never leaks its port.
- `.superset/ports.json` is **generated per workspace** to label the port in Superset's
  sidebar — don't commit it.

## Local tweaks

Add personal steps without touching this config via `.superset/config.local.json`:

```json
{ "setup": { "after": ["npm run db:seed"] } }
```
