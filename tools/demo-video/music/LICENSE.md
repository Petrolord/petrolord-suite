# Background music licence

## Default track: "Horizons" (original, made by `compose.py`)

- **What it is:** an original piece made entirely by `compose.py` in this
  folder: sine partials, seeded noise, envelopes and a synthetic reverb
  written for Petrolord. It uses no samples, loops, presets, MIDI files or
  recordings from anyone else.
- **Rights:** Lordsway Energy / Petrolord own the script and its output. No
  third party has any claim on it, so it is clear for YouTube (including
  monetised videos), the NAPE booth and any other public showing. No
  attribution is needed and no performing-rights society is involved.
- **Content ID:** the track is not registered with any Content ID or
  fingerprinting service. Nobody else holds a copy to register, so no third
  party claim can match it.
- **Making it again:** the output is deterministic for a given seed:
  `python3 compose.py --out <file>.wav --minutes 11 --seed 7` (numpy +
  scipy). The audio file is not committed; masters live in R2 beside the
  videos.

## Sources considered and not used (2026-10-17)

| Source | Why not |
|---|---|
| ElevenLabs Music | Its Music Terms (Exhibit A) allow commercial use on paid plans, but the Free, Starter, Creator and Pro plans are "For Individual Use Only" (Scale under 10 staff, Business under 50). Our API key cannot read which plan we hold, so the rights for company marketing are unclear. Usable only once the owner confirms the plan. |
| FreePD (CC0) | The site has closed. |
| incompetech (Kevin MacLeod, CC BY 4.0) | The licence is clear, but there are reports of third-party false Content ID claims on these tracks on YouTube. |

## Swapping in licensed stock music

The owner may choose a licensed track (Epidemic Sound, Artlist). The mix
step takes any audio file: change `music.file` in the module definition
(`storyboards/geo-module.mjs`) and record the licence (service, track,
licence ID, account and date) in a new section of this file before
publishing.
