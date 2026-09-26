# Find sample-to-sample discontinuities (clicks) in a WAV.
import sys, numpy as np
from scipy.io import wavfile
from scipy import signal
sr, x = wavfile.read(sys.argv[1]); x = x.astype(np.float64) / 32768.0
b, a = signal.butter(4, 6000 / (sr / 2), btype='highpass')
worst = []
for ch in range(2):
    hp = signal.lfilter(b, a, x[:, ch])
    d = np.abs(hp)
    # local context: compare each spike with the median high-frequency level around it
    win = int(0.01 * sr)
    idx = np.argsort(d)[-40:]
    for i in idx:
        lo, hi = max(0, i - win), min(len(d), i + win)
        ctx = np.median(d[lo:hi]) + 1e-6
        worst.append((d[i] / ctx, i / sr, ch, d[i]))
worst.sort(reverse=True)
for r, t, ch, v in worst[:12]:
    print(f'ratio {r:7.1f} at {t:7.3f}s ch{ch} hp {v:.4f}')
