# Tutorial scripts

Voice-over scripts with screen directions for the Petrolord Suite tutorial
series (drafted 2026-09-10; brought into the repo 2026-09-23 so they live
beside the data they record against).

Each script carries a **Data for this episode** block naming the files to load
from the Ekene demonstration dataset (release `ekene-demo-v1`,
`tools/demo-dataset/`). That block is generated, not written: it comes from
the kit's `episodes/episode-NN-*.md` note and sits between `KIT-DATA` markers.
After any change to the kit:

```
npx tsx tools/demo-dataset/generate.mjs
node tools/demo-dataset/sync-episode-scripts.mjs
```

Open a script in a browser to read or record from it (Narration only hides
the screen directions; each section has its own copy button).

Episodes 11 to 16 have kit notes but no scripts yet.
