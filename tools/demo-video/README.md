# Demo videos

AI-narrated walkthroughs of Suite apps for YouTube and the NAPE booth screens.
A storyboard says what to show and what to say; a machine plays it back in a
real browser at human pace, so every take is identical and can be re-made
after any UI change.

```
node tools/demo-video/make.mjs <storyboard> [--stage tts|record|assemble|all] [--base-url URL]
```

Output goes to `/root/demo-videos/<storyboard id>/` (outside git):

| File | What it is |
|---|---|
| `youtube.mp4` | 3840x2160, 30 fps, narration at -14 LUFS |
| `youtube.srt`, `youtube.vtt` | captions to upload with it |
| `chapters.txt` | chapter list for the YouTube description |
| `nape.mp4` | 3840x2160, silent, large burned-in subtitles, ends on a card so it loops |
| `raw.mkv`, `timeline.json` | the screen capture and when each step ran |

## How it works

1. **Narration** (`lib/tts.mjs`): ElevenLabs, voice Daniel (British English,
   the owner's pick), model `eleven_multilingual_v2`, `/with-timestamps`.
   Clips are cached by a hash of the text, the neighbouring lines and the
   voice settings, so re-running after one line changes costs one clip.
2. **Recording** (`lib/record.mjs`, `lib/capture.mjs`): Chrome in `--app` mode
   on Xvfb, page 1920x1080 CSS at device scale 1.3333, captured by ffmpeg at
   2560x1440, 30 fps. A 4-core host managed only about 8 fps capturing 4K
   live, so the capture is upscaled to 4K at the end. Each step starts its
   action, its narration starts `lead` seconds later, and the next step waits
   until the narration has finished, so voice and picture are in sync by
   construction.
3. **Presenter layer** (`lib/overlay.js`): a visible cursor with eased,
   slightly curved movement, a click ripple, a highlight ring, callouts and a
   chapter title. It is injected into the page and never changes what the app
   does.
4. **Assembly** (`lib/assemble.mjs`): title cards (`cards/card.html`, rendered
   at 4K), each narration clip placed at its recorded start, subtitles from the
   character times (`lib/captions.mjs`), one encode pass with two outputs.

## Storyboards

`storyboards/<id>.mjs` exports `{ id, app, eyebrow, title, subtitle, setup, steps }`.
`setup(d, shared)` logs in and reaches the opening screen (not filmed). Each
step: `{ id, say, do: async (d) => {...}, chapter?, lead?, actAfter?, hold?, tail? }`.
The director `d` has `click`, `type`, `select`, `moveTo`, `scroll`,
`highlight`, `callout`, `lowerThird`, `waitFor`, `waitText` and `text`
(`lib/director.mjs`). Write `say` the way it should be spoken: spell out
acronyms (R. W.) and numbers (two point six five).

Narration is written after a dry run on the real data, so every number spoken
is the number on screen.

## Secrets and account

Never in git. `/root/.elevenlabs.env` holds `ELEVENLABS_API_KEY`;
`/root/.demo-video.env` holds `DEMO_EMAIL`, `DEMO_PASSWORD` and `DEMO_ORG` for
the "Petrolord Demo" org (licences: migration
`20261008090000_demo_org_module_access.sql`).

## Host needs

`ffmpeg` (with libass), `Xvfb`, the Playwright Chromium, and the Inter font
(`fonts-inter`) for the burned-in subtitles.
