# Generate pandion-test-data.csv — one fake study exercising all seven modules.
#
# Fake study: 240 participants in a training intervention. Three conditions
# (group A/B/C), two collection sites (S1/S2). Engineered so every module has
# something visible to show:
#   - score:   group effect A < B < C (+ small site effect)        -> Compare Groups, Distribution
#   - t1..t4:  improvement over time, group x time interaction,
#              high within-subject correlation (CM correction)     -> Repeated Measures
#   - hours:   r ~ +0.6 with score                                 -> Scatter (fit, ellipse)
#   - rt:      lognormal (skewed, strictly positive), r ~ -0.4
#              with score                                          -> Distribution Q-Q / log10 axes
#   - age:     ~null correlations                                  -> Correlation non-sig treatment
#   - pref:    P..T category counts unequal + group-dependent      -> Frequencies (pareto, stack/fill)
#   - q1..q6:  1-5 Likert, agree-heavy -> disagree-heavy + one
#              polarized item (wide CI on the means plot)          -> Likert / Survey
#   - a few NAs in rt/hours/t3/q3 (pairwise-complete + NA drops)
#
# Run: Rscript scripts/make-test-data.R   (writes pandion-test-data.csv at repo root)

set.seed(2026)
n <- 240

group <- factor(rep(c("A", "B", "C"), each = n / 3))
site  <- factor(rep(rep(c("S1", "S2"), each = n / 6), times = 3))
g     <- as.numeric(group)                       # 1, 2, 3

ability <- rnorm(n)                              # shared latent -> correlations

score <- round(60 + 5 * (g - 1) + 2 * (site == "S2") + 8 * ability + rnorm(n, 0, 6), 1)
hours <- round(pmax(0.5, 4 + 0.8 * g + 1.5 * ability + rnorm(n, 0, 1.2)), 1)
rt    <- round(exp(6.2 - 0.25 * ability + rnorm(n, 0, 0.35)))   # ms, right-skewed
age   <- pmin(pmax(round(rnorm(n, 21, 2.5)), 18), 35)

# Repeated measures: subject intercept (high ICC) + per-group slope
subj  <- rnorm(n, 0, 6)
slope <- 2 + 1.5 * (g - 1)                       # A +2/step, B +3.5, C +5
tm <- sapply(0:3, function(k) round(55 + subj + 4 * ability + slope * k + rnorm(n, 0, 4), 1))
colnames(tm) <- paste0("t", 1:4)

# Frequencies: preference choice, distribution differs by group
pref_probs <- list(
  A = c(.34, .26, .18, .14, .08),
  B = c(.22, .30, .22, .16, .10),
  C = c(.14, .22, .26, .22, .16))
pref <- factor(vapply(seq_len(n), function(i)
  sample(c("P", "Q", "R", "S", "T"), 1, prob = pref_probs[[as.character(group[i])]]),
  character(1)))

# Likert battery, 1-5 (odd k -> exercises split-middle centering)
lik <- function(p) sample(1:5, n, replace = TRUE, prob = p)
q1 <- lik(c(.02, .06, .12, .38, .42))   # strong agree
q2 <- lik(c(.05, .12, .20, .38, .25))   # lean agree
q3 <- lik(c(.10, .18, .40, .20, .12))   # neutral-heavy
q4 <- lik(c(.25, .35, .20, .13, .07))   # lean disagree
q5 <- lik(c(.42, .33, .13, .08, .04))   # strong disagree
q6 <- lik(c(.32, .10, .10, .12, .36))   # polarized -> wide CI

dat <- data.frame(id = seq_len(n), group, site, age, hours, rt, score, tm,
                  pref, q1, q2, q3, q4, q5, q6)

# Sprinkle NAs (tests pairwise-complete correlations + per-geom NA drops)
dat$rt[sample(n, 6)]    <- NA
dat$hours[sample(n, 5)] <- NA
dat$t3[sample(n, 4)]    <- NA
dat$q3[sample(n, 5)]    <- NA

out <- file.path(dirname(dirname(normalizePath(sub("--file=", "",
  grep("--file=", commandArgs(FALSE), value = TRUE)[1])))), "pandion-test-data.csv")
write.csv(dat, out, row.names = FALSE, na = "")
cat("wrote", out, "-", nrow(dat), "rows x", ncol(dat), "cols\n")

# Sanity: did the engineered structure land?
cat("\nscore means by group:", round(tapply(dat$score, dat$group, mean), 1), "\n")
cat("t1->t4 gain by group:",
    round(tapply(dat$t4 - dat$t1, dat$group, mean, na.rm = TRUE), 1), "\n")
cc <- function(a, b) round(cor(a, b, use = "pairwise.complete.obs"), 2)
cat("cor(hours,score):", cc(dat$hours, dat$score),
    " cor(rt,score):",   cc(dat$rt, dat$score),
    " cor(age,score):",  cc(dat$age, dat$score), "\n")
cat("pref counts:", paste(names(table(dat$pref)), table(dat$pref), collapse = "  "), "\n")
cat("likert means:", round(colMeans(dat[paste0("q", 1:6)], na.rm = TRUE), 2), "\n")
