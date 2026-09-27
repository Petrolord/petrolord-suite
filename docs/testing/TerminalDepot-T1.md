# Terminal & Depot Studio: senior test T1

- App: Terminal & Depot Studio (Midstream & Downstream)
- Wave / position: Wave 6, #83 (Senior Testing Programme; economics and downstream)
- Build tested: main (with #700 to #704) plus #706 to #715
- Tester: Claude (AI senior tester), T1 cycle
- Benchmark:
  - dip-to-volume through a strapping table;
  - stock reconciliation against tolerance;
  - loading-rack Erlang C;
  - tank farm cover and throughput economics.
- Coverage before T1: terminal engine goldens and the context tests; no human walk

## How it was tested

I used `/dev/studio/terminal-depot` at 1366 x 768 on the defaults:

- two tanks from dips;
- a day of 800 m3 receipts and 640 m3 deliveries;
- a 2-bay rack.

I then replaced T-01's strapping table.

## Verdict

**Demo-ready after T1. It was S2 before: every stock figure came through
a strapping table nobody could see or replace.**

- Tanks:
  - T-01 at 7,200 mm on the placeholder table (5,000 m3 over 12,000 mm) is
    3,000 m3, less 25 m3 of water, so **2,975** gross;
  - T-02 is 1,260 - 12 = **1,248**.
- Stock 4,223 against a book of 4,068 + 800 - 640 - 2 = 4,226, which is
  **-3.0 m3**. That is -0.21% of 1,440 m3 moved, inside a 7.2 m3 tolerance.
- Farm:
  - working capacity 4,880 + 2,920 = **7,800**;
  - ullage 8,000 - 4,223 = **3,777**;
  - cover 4,023 / 640 = **6.3 days**;
  - turns 640 x 365 / 7,800 = **29.9**.
- Rack: lambda 5/h, 22 min, 2 bays, a = 1.833. rho is **92%**, Erlang C
  wait probability **88%**, and Wq = 0.877 / (5.455 - 5) h = **115.7 min**.
- Margin 1,440 x (8 - 2) - 30,000 = **-21,360**, or -14.83/m3. The loss of
  (2 + 3) m3 at 745 kg/m3 is 3.73 t (one density, as the guide says).

## Findings

| ID | Severity | Finding | Outcome |
| --- | --- | --- | --- |
| TD-T1-001 | S2 | Each tank's strapping table (the step that turns a dip into a volume) was a hidden linear placeholder, built from capacity and a tank height that had no box. It could not be seen or replaced, and editing capacity did not change it, so capacity never reached the stock. | Each tank has a Height field and a Strapping table editor (paste height and volume pairs). The placeholder is labelled as such and follows capacity and height until a real table is supplied. Supplied tables are validated (two rows or more, rising heights). |
| TD-T1-002 | S3 | A losing throughput margin read "$-21,360" in lime green. | It reads -$21,360 in red. |
| TD-T1-003 | S3 | The gain and loss trend was smoothed, and the day rows' two inputs had no labels (only placeholders that vanish once filled). | Straight segments with the Suite legend. The day rows have column headings and labelled inputs. |

## Tests

- `e2e/terminal-depot-t1.spec.js` checks:
  - -3.0 m3 unaccounted and 115.7 min;
  - -$21,360 in red;
  - the day inputs are labelled;
  - the placeholder note is shown;
  - a pasted table moves T-01 to 3,054.0 m3 gross (2,600 + 0.6 x 800 - 26).
- Terminal and context jest: 388 pass.
