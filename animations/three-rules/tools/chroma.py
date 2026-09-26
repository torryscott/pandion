# Per-bar chroma check: which pitch classes dominate each bar of the score.
import sys, numpy as np
from scipy.io import wavfile
sr, x = wavfile.read(sys.argv[1]); x = x.astype(np.float64).mean(axis=1) / 32768.0
names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
plan = ['Dmaj9', 'Bm9', 'D', 'Bm7', 'Gmaj7', 'A7sus', 'Gmaj7', 'A', 'D', 'Bm7', 'Gmaj7', 'A', 'D', 'Bm7', 'Gmaj7', 'A', 'Gmaj7', 'Gmaj9', 'A7sus', 'Dmaj9', 'Dmaj9']
for b in range(21):
    s0, s1 = int((b * 2.4 + 0.3) * sr), int((b * 2.4 + 2.1) * sr)
    seg = x[s0:s1] * np.hanning(s1 - s0)
    if len(seg) < 1000: break
    F = np.abs(np.fft.rfft(seg)); f = np.fft.rfftfreq(len(seg), 1 / sr)
    m = (f > 60) & (f < 2000)
    midi = 69 + 12 * np.log2(f[m] / 440.0)
    pc = np.mod(np.round(midi), 12).astype(int)
    ch = np.zeros(12)
    np.add.at(ch, pc, F[m] ** 2)
    ch /= ch.max()
    top = np.argsort(ch)[::-1][:5]
    print(f'bar {b:2d} {plan[b]:6s}: ' + ' '.join(f'{names[i]}({ch[i]:.2f})' for i in top))
