# Loudness / balance / spectrogram check for the rendered score.
import sys, numpy as np
from scipy.io import wavfile
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
path = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else path.replace('.wav', '-spec.png')
sr, x = wavfile.read(path)
x = x.astype(np.float64) / 32768.0
mono = x.mean(axis=1)
# K-weighting (ITU-R BS.1770) approximation: high-shelf + high-pass
b1, a1 = signal.iirfilter(2, 1500 / (sr / 2), btype='highpass', ftype='butter')
def kweight(s):
    # pre-filter (shelf ~ +4 dB above 1.5 kHz) approximated by adding scaled HP
    hp = signal.lfilter(b1, a1, s)
    s2 = s + 0.58 * hp
    b2, a2 = signal.butter(2, 38 / (sr / 2), btype='highpass')
    return signal.lfilter(b2, a2, s2)
kL, kR = kweight(x[:, 0]), kweight(x[:, 1])
blk = int(0.4 * sr); hop = int(0.1 * sr)
ms = []
for i in range(0, len(kL) - blk, hop):
    ms.append((np.mean(kL[i:i + blk] ** 2) + np.mean(kR[i:i + blk] ** 2)))
ms = np.array(ms)
lk = -0.691 + 10 * np.log10(ms + 1e-12)
gated = ms[lk > -70]
rel = -0.691 + 10 * np.log10(gated.mean()) - 10
g2 = gated[(-0.691 + 10 * np.log10(gated + 1e-12)) > rel]
lufs = -0.691 + 10 * np.log10(g2.mean())
print(f'integrated loudness ~ {lufs:.1f} LUFS, sample peak {np.abs(x).max():.3f} ({20*np.log10(np.abs(x).max()):.1f} dBFS)')
# short-term loudness per 2.4 s bar
for b in range(0, int(len(mono) / sr / 2.4) + 1):
    s0, s1 = int(b * 2.4 * sr), int((b + 1) * 2.4 * sr)
    seg = x[s0:s1]
    if len(seg) == 0: break
    r = np.sqrt(np.mean(seg ** 2))
    print(f'bar {b:2d} t={b*2.4:5.1f}s rms {20*np.log10(r+1e-9):6.1f} dBFS  peak {20*np.log10(np.abs(seg).max()+1e-9):6.1f}')
# band balance
f, P = signal.welch(mono, sr, nperseg=8192)
def band(a, b):
    m = (f >= a) & (f < b)
    return 10 * np.log10(P[m].sum() + 1e-20)
tot = 10 * np.log10(P.sum())
for a, b in [(20, 60), (60, 250), (250, 1000), (1000, 4000), (4000, 12000), (12000, 20000)]:
    print(f'band {a:5d}-{b:5d} Hz: {band(a,b)-tot:6.1f} dB rel')
# spectrogram
fig, ax = plt.subplots(2, 1, figsize=(16, 7), gridspec_kw={'height_ratios': [2, 1]})
fs, ts, S = signal.spectrogram(mono, sr, nperseg=2048, noverlap=1536)
ax[0].pcolormesh(ts, fs, 10 * np.log10(S + 1e-12), shading='auto', vmin=-120, vmax=-30, cmap='magma')
ax[0].set_yscale('symlog', linthresh=200); ax[0].set_ylim(20, 20000); ax[0].set_ylabel('Hz')
tt = np.arange(len(mono)) / sr
env = np.sqrt(signal.lfilter([1], [1, -0.999], mono ** 2) * 0.001)
ax[1].plot(tt[::200], 20 * np.log10(np.abs(x[::200, 0]) + 1e-6), lw=0.3)
ax[1].set_ylim(-60, 0); ax[1].set_xlim(0, tt[-1])
for b in range(0, 22): ax[0].axvline(b * 2.4, color='w', lw=0.3, alpha=0.4)
plt.tight_layout(); plt.savefig(out, dpi=80)
print('spectrogram', out)
