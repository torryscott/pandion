# Tail-specific references use survival probabilities directly. An absolute
# tolerance of 1e-9 would incorrectly accept zero for every tiny p value here.
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[[1]] else "/tmp/pandion-stats-tail.json"
ts <- list(); fs <- list(); tests <- list()
for (df in c(.5, 1, 2, 5, 30, 100, 1000)) for (t in c(-100, -12, -8, -2, 0, 2, 8, 12, 100)) {
    ts[[length(ts) + 1L]] <- list(t = t, df = df,
        two = 2 * pt(abs(t), df, lower.tail = FALSE),
        greater = pt(t, df, lower.tail = FALSE), less = pt(t, df))
}
for (df1 in c(1, 2, 5, 10)) for (df2 in c(.5, 1, 10, 100, 1000)) for (f in c(0, .01, 1, 10, 100, 1e6)) {
    fs[[length(fs) + 1L]] <- list(f = f, df1 = df1, df2 = df2, p = pf(f, df1, df2, lower.tail = FALSE))
}
for (n in c(3, 20, 60)) for (shift in c(.2, 5, 30)) {
    x <- seq_len(n) / n; y <- x + shift + .1 * sin(seq_len(n))
    for (method in c("welch", "student", "paired")) for (tail in c("two", "greater", "less")) {
        r <- t.test(x, y, var.equal = method == "student", paired = method == "paired",
                    alternative = switch(tail, two = "two.sided", greater = "greater", less = "less"))
        tests[[length(tests) + 1L]] <- list(n = n, shift = shift, x = x, y = y, method = method, tail = tail,
            t = unname(r$statistic), df = unname(r$parameter), p = r$p.value)
    }
    r <- oneway.test(c(x,y) ~ rep(c("x","y"), each = n), var.equal = TRUE)
    tests[[length(tests) + 1L]] <- list(n = n, shift = shift, x = x, y = y, method = "anova",
        f = unname(r$statistic), df1 = unname(r$parameter[[1]]), df2 = unname(r$parameter[[2]]), p = r$p.value)
}
writeLines(jsonlite::toJSON(list(schemaVersion = 1L, ts = ts, fs = fs, tests = tests),
    auto_unbox = TRUE, digits = I(17)), out)
cat("TAIL REFERENCES:", length(ts), "t distributions,", length(fs), "F distributions,", length(tests), "actual tests\n")
