# Lion Catalog

Unofficial student-facing browser for Columbia University courses. Default view is **Computer Science (COMS), Fall 2026**.

The app reads public HTML only. It is a catalog, not a registrar. You can search, filter, and open a section. You cannot register, drop, swap, waitlist, or add to cart.

## Run

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

No environment variables. No secrets. No Columbia login.

## What you can do

- Browse one subject at a time (COMS first)
- Switch subjects from the public Directory index
- Search title, instructor, call number, or course number
- Filter by open seats, course level, and credits
- Open a section for description and prerequisites when the public detail page has them
- See meeting days, times, and rooms when the Columbia College bulletin page for that subject is available

## Data sources

| Source | Used for | How |
| --- | --- | --- |
| [doc.sis.columbia.edu](https://doc.sis.columbia.edu) | Subjects, sections, enrollment, instructors, call numbers | Public HTML. Cached ~10 minutes. |
| [bulletin.columbia.edu](https://bulletin.columbia.edu) | Meeting times and locations | Server-side fetch only. Optional. |

Example subject page:

`https://doc.sis.columbia.edu/subj/COMS/_Fall2026.html`

Example section page:

`https://doc.sis.columbia.edu/subj/COMS/W4113-20263-001/`

The app fetches **one subject page** per view, plus the subject index when you open the switcher data, plus at most one bulletin page. It does not crawl the university.

If a live Columbia fetch fails (CI, offline, HTML change), the site still builds and shows an empty or error state at runtime.

## Public-only constraint

- Use only public Directory and Bulletin pages
- Never call `*.api.columbia.edu` (prod, dev, test, stage, uat, or otherwise)
- Never collect, store, log, or transmit Columbia OAuth tokens, CAS passwords, or Duo codes
- Never implement register / drop / swap / waitlist / add-to-cart

This is not an official Columbia product.
