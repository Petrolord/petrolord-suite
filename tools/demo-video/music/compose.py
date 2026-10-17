#!/usr/bin/env python3
"""Original background music for the Petrolord showcase videos.

Every sound is synthesised here from sine partials and seeded noise: no
samples, loops or presets from anyone else, so the track carries no third
party rights (see LICENSE.md). The output is deterministic for a given seed,
so the file never needs to be committed: run this to make it again.

    python3 compose.py --out /root/demo-videos/music/petrolord-horizons.wav [--minutes 11] [--seed 7]

Needs numpy and scipy (a venv is fine). Sound: warm additive pads, a soft
sub-bass pulse, a gentle heartbeat kick, a quiet shaker and a sparse plucked
arpeggio with a dotted-eighth echo, all through a synthetic hall reverb.
Key D major, 84 BPM, phrases of 8 and 16 bars.
"""
import argparse
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.io import wavfile

SR = 48000
BPM = 84
BEAT = 60.0 / BPM
BAR = 4 * BEAT

def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)

# chords as MIDI notes (pad voicing), bass root
PROG_A = [  # Dmaj9, Bm9, Gmaj7(9), A6sus
    ([50, 57, 61, 64, 66], 38), ([47, 54, 57, 61, 62], 35),
    ([43, 50, 54, 57, 62], 31), ([45, 52, 54, 59, 62], 33)]
PROG_B = [  # Em9, Gmaj7, D/F#, Asus4 -> A
    ([40, 47, 54, 55, 59], 40), ([43, 50, 54, 57, 59], 43),
    ([42, 50, 54, 57, 62], 42), ([45, 50, 52, 57, 64], 45)]

def env_adsr(n, a, r, sustain=1.0):
    e = np.ones(n) * sustain
    na = min(n, int(a * SR)); nr = min(n - na, int(r * SR))
    if na: e[:na] = np.linspace(0, sustain, na) ** 1.5
    if nr: e[n - nr:] = sustain * np.linspace(1, 0, nr) ** 2
    return e

def pad_note(freq, dur, rng, bright=1.0):
    """Additive 'analogue' pad: three detuned voices, soft harmonic roll-off."""
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for k, cents in enumerate((-7, 0, 6)):
        f = freq * 2 ** (cents / 1200)
        ph = rng.uniform(0, 2 * np.pi, 12)
        v = np.zeros(n)
        for h in range(1, 9):
            fh = f * h
            if fh > 6000: break
            amp = (1 / h ** 1.7) * np.exp(-(h - 1) / (3.0 * bright))
            v += amp * np.sin(2 * np.pi * fh * t + ph[h])
        pan = (k - 1) * 0.55
        out[:, 0] += v * (1 - pan) * 0.5; out[:, 1] += v * (1 + pan) * 0.5
    # slow breathing tremolo
    out *= (0.92 + 0.08 * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6)))[:, None]
    return out

def pluck(freq, dur=1.6):
    n = int(dur * SR); t = np.arange(n) / SR
    v = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 6) + 0.12 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 9)
    e = np.exp(-t * 3.2) * np.minimum(1, t / 0.004)
    return v * e

def sub(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    e = np.minimum(1, t / 0.03) * np.exp(-t * 2.2)
    return (np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(4 * np.pi * freq * t)) * e

def kick(dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 48 + 60 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * np.minimum(1, t / 0.006)

def shaker(rng, dur=0.09):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n) * np.exp(-t * 55) * np.minimum(1, t / 0.006)
    sos = butter(2, [5000, 11000], btype='band', fs=SR, output='sos')
    return sosfilt(sos, x)

def add(buf, at, sig, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= len(buf): return
    s = sig[: len(buf) - i]
    if s.ndim == 1:
        buf[i:i + len(s), 0] += s * gain * (1 - pan) * 0.7
        buf[i:i + len(s), 1] += s * gain * (1 + pan) * 0.7
    else:
        buf[i:i + len(s)] += s * gain

def hall_ir(rng, secs=3.2):
    n = int(secs * SR); t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-t * 2.4)[:, None]
    sos = butter(2, 3800, btype='low', fs=SR, output='sos')
    ir = sosfilt(sos, ir, axis=0)
    ir[: int(0.02 * SR)] = 0  # pre-delay
    return ir / np.sqrt((ir ** 2).sum(axis=0))

# section plan: (bars, progression, pad, pulse, kick, shaker, pluck); repeats
PLAN = [
    (4, 'A', 1, 0, 0, 0, 1),    # short intro under a cold open
    (16, 'A', 1, 1, 1, 1, 1),
    (16, 'B', 1, 1, 1, 0, 1),
    (8, 'A', 1, 1, 0, 0, 0),    # breath
    (16, 'A', 1, 1, 1, 1, 1),
    (16, 'B', 1, 1, 1, 1, 1),
    (8, 'A', 1, 0, 0, 0, 1),    # breath
]

def section_at(bar):
    """(section tuple, bar within section, section length) for a bar; the plan after the intro repeats."""
    i = 0
    while True:
        for k, sec in enumerate(PLAN if i == 0 else PLAN[1:]):
            if bar < sec[0]: return sec[1:], bar, sec[0]
            bar -= sec[0]
        i += 1

def compose(minutes, seed):
    rng = np.random.default_rng(seed)
    total = minutes * 60.0
    bars = int(np.ceil(total / BAR)) + 2
    n = int((bars * BAR + 6) * SR)
    pads = np.zeros((n, 2)); dry = np.zeros((n, 2)); verb_send = np.zeros((n, 2))
    pluck_pat = [0, 2, 4, 3, 1, 4, 2, 3]  # chord-tone indices on eighths
    for bar in range(bars):
        sec, in_sec, sec_bars = section_at(bar)
        prog = PROG_A if sec[0] == 'A' else PROG_B
        chord, root = prog[(in_sec // 2) % 4]
        t0 = bar * BAR
        if bar % 2 == 0 and sec[1]:
            for m in chord:
                m = m + 12 if m < 50 else m  # no mud: pad voices from D3 up
                add(pads, t0, pad_note(midi_hz(m), 2 * BAR + 1.8, rng, bright=0.9) * env_adsr(int((2 * BAR + 1.8) * SR), 1.6, 1.8)[:, None], gain=0.10)
        for b in range(4):
            tb = t0 + b * BEAT
            if sec[2]:
                add(dry, tb, sub(midi_hz(root), BEAT * 0.9), gain=0.2 if b % 2 == 0 else 0.13)
                add(dry, tb + BEAT / 2, sub(midi_hz(root + 12), BEAT * 0.45), gain=0.07)
            if sec[3] and b in (0, 2) and in_sec < sec_bars - 1:
                add(dry, tb, kick(), gain=0.15)
            if sec[4]:
                for e8 in range(2):
                    add(verb_send, tb + e8 * BEAT / 2, shaker(rng), gain=(0.05 if e8 else 0.03), pan=0.3)
        if sec[5] and in_sec % 2 == 0:
            notes = sorted(chord)[1:] + [chord[1] + 12]
            for k, idx in enumerate(pluck_pat):
                if rng.random() < 0.28: continue  # sparse, human
                m = notes[idx % len(notes)] + 12
                tp = t0 + k * BEAT / 2
                p = pluck(midi_hz(m)); pan = rng.uniform(-0.5, 0.5)
                add(verb_send, tp, p, gain=0.09, pan=pan)
                add(verb_send, tp + 0.75 * BEAT, p, gain=0.04, pan=-pan)  # dotted-eighth echo
                add(verb_send, tp + 1.5 * BEAT, p, gain=0.018, pan=pan)
    pads = sosfilt(butter(2, 110, btype='high', fs=SR, output='sos'), pads, axis=0)
    ir = hall_ir(rng)
    wet = np.stack([fftconvolve(pads[:, c] * 0.6 + verb_send[:, c], ir[:, c])[:n] for c in range(2)], axis=1)
    mix = pads * 0.75 + verb_send * 0.45 + dry + wet * 0.55
    # gentle tone: roll off sub rumble and air
    mix = sosfilt(butter(2, 32, btype='high', fs=SR, output='sos'), mix, axis=0)
    mix = sosfilt(butter(1, 9000, btype='low', fs=SR, output='sos'), mix, axis=0)
    mix = mix[: int(total * SR)]
    # soft clip safety and fades
    mix = np.tanh(mix * 1.2) / 1.2
    f = int(4 * SR); mix[:f] *= np.linspace(0, 1, f)[:, None]; mix[-f:] *= np.linspace(1, 0, f)[:, None]
    mix /= np.max(np.abs(mix)) / 0.89
    return mix

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--minutes', type=float, default=11)
    ap.add_argument('--seed', type=int, default=7)
    a = ap.parse_args()
    x = compose(a.minutes, a.seed)
    wavfile.write(a.out, SR, (x * 32767).astype(np.int16))
    print(f'{a.out}: {len(x) / SR:.1f} s')
