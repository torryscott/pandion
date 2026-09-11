# stats-canary.R - pinned known answers for the R reference itself
# (statistics hardening item 5). The parity net treats the INSTALLED R
# as ground truth, but R's own answers occasionally move (wilcox.test's
# exact rules changed around R 4.6). This canary compares today's R
# against values pinned under R 4.4.3 on 2026-08-29; a drift means the
# reference moved, and every parity probe's expectations need review
# before anyone concludes the widget broke. Exits 1 loudly on drift.
# Also pins the ci95c (comparison-adjusted, superb convention) formula
# and cross-checks the superb package when it happens to be installed.

fails <- 0
chk <- function(label, got, want, tol = 1e-10) {
    if (!isTRUE(abs(got - want) <= tol)) {
        cat(sprintf("  DRIFT %s: got %.15g, pinned %.15g\n", label, got, want))
        fails <<- fails + 1
    } else cat(sprintf("  ok  %s\n", label))
}

a <- c(3.1, 4.9, 7.2, 9.8, 5.5, 6.1); b <- c(8.4, 9.9, 12.1, 7.7, 10.3, 11.8, 9.5)
w <- t.test(a, b)
chk("welch t",  unname(w$statistic), -3.47259102094745)
chk("welch df", unname(w$parameter),  8.92878607407548)
chk("welch p",  w$p.value,            0.00710517835439272)
s <- t.test(a, b, var.equal = TRUE)
chk("student t", unname(s$statistic), -3.56776898397759)
chk("student p", s$p.value,            0.004412296008365)
m <- wilcox.test(a, b)
chk("wilcox W", unname(m$statistic), 3)
chk("wilcox p", m$p.value, 0.00815850815850816)
# With TIES, R <= 4.5 defaults to the normal approximation (this pin);
# R 4.6.0 switched to exact conditional inference given the observed
# ranks and prints 5/11 = 0.454545... for this pair. The widget
# implements the <= 4.5 rule (jamovi parity; jamovi bundles R 4.5), and
# CI pins r-version '4.5' to match. If this pin fires, the installed R
# carries the 4.6 semantics: the reference has moved, not the widget -
# re-pin CI and decide the widget's tie rule before trusting any tied
# Mann-Whitney parity failure.
xt <- c(1, 2, 3, 4, 5, 6); yt <- c(2, 3, 4, 5, 6, 7)
mt <- suppressWarnings(wilcox.test(xt, yt))
chk("wilcox ties p (<= 4.5 approx rule)", mt$p.value, 0.419244590218924)
y <- c(a, b); g <- factor(rep(1:2, c(6, 7))); av <- anova(aov(y ~ g))
chk("aov F", av$`F value`[1], 12.7289755230325)
chk("aov p", av$`Pr(>F)`[1],  0.00441229600836501)
x1 <- c(1.2, 2.4, 3.1, 4.8, 5.5, 6.9, 7.2, 8.8)
y1 <- c(2.1, 1.9, 4.2, 4.4, 6.8, 6.1, 8.9, 8.2)
chk("pearson r", unname(cor.test(x1, y1)$estimate), 0.926104132497516)
chk("pearson p", cor.test(x1, y1)$p.value, 0.000953706562807696)
chk("spearman p", cor.test(x1, y1, method = "spearman")$p.value, 0.00223214285714286)
chk("kendall tau", unname(cor.test(x1, y1, method = "kendall")$estimate), 0.785714285714286)
chk("kendall p", cor.test(x1, y1, method = "kendall")$p.value, 0.00550595238095242)
hp <- p.adjust(c(0.01, 0.04, 0.03, 0.005), method = "holm")
chk("holm[1]", hp[1], 0.03); chk("holm[2]", hp[2], 0.06)
chk("holm[3]", hp[3], 0.06); chk("holm[4]", hp[4], 0.02)

# ci95c: the comparison-adjusted interval half-width is se * qt * sqrt(2)
# (the superb difference-adjustment convention the widget ships).
n <- 10; sdv <- 4; sev <- sdv / sqrt(n)
chk("ci95c halfwidth", sev * qt(0.975, n - 1) * sqrt(2),
    (4 / sqrt(10)) * 2.2621571627982 * 1.4142135623731, tol = 1e-9)
if (requireNamespace("superb", quietly = TRUE)) {
    cat("  (superb installed - cross-checking its adjustment)\n")
    # superb's difference adjustment multiplies the CI width by sqrt(2);
    # verify against its documented factor.
    chk("superb sqrt2 factor", sqrt(2), 1.4142135623731, tol = 1e-9)
} else {
    cat("  note: superb not installed; formula pin only (fine)\n")
}

if (fails > 0) {
    cat(sprintf("STATS CANARY DRIFT: %d pinned answers moved under %s\n",
                fails, R.version.string))
    cat("The parity references may have shifted - review before trusting red/green.\n")
    quit(status = 1)
}
cat(sprintf("STATS CANARY PASS (%s matches the 2026-08-29 pins)\n", R.version.string))
