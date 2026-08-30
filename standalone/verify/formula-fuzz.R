# formula-fuzz.R - R references for the computed-variable formula engine
# (the stats-fuzzer recipe applied to ps-formula.js). Seeded hostile
# columns; a fixed roster of formulas covering every function, operator,
# and precedence rule in the language's closed vocabulary; per-row
# expected values computed with BASE R. Where the engine claims R parity
# (ROUND after Torry's Aug 2026 ruling, VSD = sd, row-wise MEAN =
# rowMeans, -x^2 precedence) the reference IS the R function; where the
# engine has a documented house rule (non-finite -> missing, division by
# zero -> missing, BIN's equal-width definition, spreadsheet TRIM) the
# reference implements that rule in R, independently. UPPER/LOWER cases
# use ASCII-only text: Rscript runs in the C locale where toupper()
# cannot case-fold accents, so unicode case-folding cannot be
# R-referenced here (LEN/CONTAINS/equality still exercise unicode).
# Seed rotates daily; GB2_FORMULA_SEED replays a failure.
args <- commandArgs(trailingOnly = TRUE)
out_path <- if (length(args) >= 1) args[[1]] else "/tmp/gb2-formula-fuzz.json"
seed_env <- Sys.getenv("GB2_FORMULA_SEED", "")
seed <- if (nzchar(seed_env)) as.integer(seed_env) else
    as.integer(format(Sys.Date(), "%Y%m%d"))
set.seed(seed)
cat(sprintf("formula-fuzz seed=%d\n", seed))

n_rand <- 20
# Column a: halves, quarters, negatives, the representation traps, NA.
a <- c(2.5, -1.5, 0.35, 2.675, NA, 0,
       round(rnorm(n_rand, 0, 8), 3) + sample(c(0, 0.5, 0.25, 0.125), n_rand, TRUE))
# Column b: integers with zeros (division) and NA.
b <- c(3, 0, -7, NA, 12, 0, sample(c(-20:20), n_rand, TRUE))
b[9] <- NA
# Column c: nonnegative for SQRT/LN, with a zero and an NA.
c_ <- c(4, 0, 9.5, NA, 0.25, 144, round(abs(rnorm(n_rand, 10, 6)), 3))
# Text with unicode (no case transforms on this one) and a missing token.
t_ <- rep(c("café", "  padded  text ", "naïve", "A,B", "NA", "plain"),
          length.out = length(a))
# ASCII-only text for UPPER/LOWER (C-locale toupper cannot fold accents).
t2 <- rep(c("Mixed Case", "abc", "XYZ", "NA", "lower UPPER", "x"),
          length.out = length(a))
n <- length(a)
stopifnot(length(b) == n, length(c_) == n)

# Values pass through the app's grid as text and back; keep them at the
# 10-significant-digit precision the payload convention ships.
a <- signif(a, 10); b <- signif(b, 10); c_ <- signif(c_, 10)

fin <- function(v) ifelse(is.finite(v), v, NA_real_)
num_or_na <- function(v) ifelse(is.na(v), NA_real_, v)

# The engine's missing text is a load-time token; mirror it here.
t_miss <- t_ == "NA"; t2_miss <- t2 == "NA"
tv <- ifelse(t_miss, NA_character_, t_)
tv2 <- ifelse(t2_miss, NA_character_, t2)
# Rscript runs in the C locale, where an unmarked UTF-8 literal is read
# as bytes and nchar("café") answers 5. A SEPARATE marked copy serves
# the LEN reference only (character counts, matching the engine's
# UTF-16 .length for all BMP text; emoji would differ; none is used
# here) - marking tv itself makes every C-locale grepl on it throw
# (the repo's documented UTF-8 law).
tv_chars <- tv
Encoding(tv_chars) <- "UTF-8"

trim_house <- function(s) ifelse(is.na(s), NA_character_,
    gsub("[ \t\r\n]+", " ", trimws(s)))
bin_house <- function(v, k) {
    lo <- suppressWarnings(min(v, na.rm = TRUE))
    hi <- suppressWarnings(max(v, na.rm = TRUE))
    if (!is.finite(lo) || !is.finite(hi)) return(rep(NA_character_, length(v)))
    if (hi == lo) return(ifelse(is.na(v), NA_character_, "bin 1"))
    idx <- floor((v - lo) / (hi - lo) * k)
    idx <- pmin(pmax(idx, 0), k - 1)
    ifelse(is.na(v), NA_character_, paste("bin", idx + 1))
}
row_stat <- function(fn, ig, ...) {
    m <- cbind(...)
    apply(m, 1, function(r) {
        vals <- r[!is.na(r)]
        if (!ig && anyNA(r)) return(NA_real_)
        if (!length(vals)) return(NA_real_)
        switch(fn, mean = mean(vals), sum = sum(vals),
                   min = min(vals), max = max(vals))
    })
}
and_house <- function(x, y) {
    # Pandion's short-circuit: a missing LEFT is missing; a false left
    # answers 0 without looking right (so false AND missing is 0).
    ifelse(is.na(x), NA_real_,
        ifelse(x == 0, 0, ifelse(is.na(y), NA_real_, as.numeric(y != 0))))
}
or_house <- function(x, y) {
    ifelse(is.na(x), NA_real_,
        ifelse(x != 0, 1, ifelse(is.na(y), NA_real_, as.numeric(y != 0))))
}

cases <- list(
    list(f = "ABS(a)", e = abs(a)),
    list(f = "SQRT(c)", e = ifelse(is.na(c_) | c_ < 0, NA, sqrt(c_))),
    list(f = "LN(c)", e = ifelse(is.na(c_) | c_ <= 0, NA, log(c_))),
    list(f = "LOG10(c)", e = ifelse(is.na(c_) | c_ <= 0, NA, log10(c_))),
    list(f = "EXP(b / 4)", e = fin(exp(ifelse(b == 0, NA, NA)))),   # placeholder, fixed below
    list(f = "FLOOR(a)", e = floor(a)),
    list(f = "CEILING(a)", e = ceiling(a)),
    list(f = "ROUND(a)", e = round(a)),
    list(f = "ROUND(a, 2)", e = round(a, 2)),
    list(f = "ROUND(a, 1)", e = round(a, 1)),
    list(f = "ROUND(a, -1)", e = round(a, -1)),
    list(f = "a + b", e = a + b),
    list(f = "a - b", e = a - b),
    list(f = "a * b", e = fin(a * b)),
    list(f = "a / b", e = fin(ifelse(is.na(a) | is.na(b) | b == 0, NA, a / b))),
    list(f = "a ^ 2", e = fin(a^2)),
    list(f = "-a ^ 2", e = fin(-(a^2))),          # R precedence: -(a^2)
    list(f = "(a + b) / 2", e = (a + b) / 2),
    list(f = "a > b", e = as.numeric(a > b)),
    list(f = "a >= 0", e = as.numeric(a >= 0)),
    list(f = "a = b", e = as.numeric(a == b)),
    list(f = "IF(a > 0, \"pos\", \"nonpos\")",
         e = ifelse(is.na(a), NA_character_, ifelse(a > 0, "pos", "nonpos"))),
    list(f = "IF(ISMISSING(a), 1, 0)", e = as.numeric(is.na(a))),
    list(f = "COALESCE(a, b)", e = ifelse(!is.na(a), a, b)),
    list(f = "COALESCE(a, 0)", e = ifelse(!is.na(a), a, 0)),
    list(f = "ISMISSING(t)", e = as.numeric(is.na(tv))),
    list(f = "MEAN(a, b)", e = row_stat("mean", FALSE, a, b)),
    list(f = "MEAN(a, b, ignore_missing = 1)", e = row_stat("mean", TRUE, a, b)),
    list(f = "SUM(a, b, c)", e = row_stat("sum", FALSE, a, b, c_)),
    list(f = "SUM(a, b, ignore_missing = 1)", e = row_stat("sum", TRUE, a, b)),
    list(f = "MIN(a, b)", e = row_stat("min", FALSE, a, b)),
    list(f = "MAX(a, b, ignore_missing = 1)", e = row_stat("max", TRUE, a, b)),
    list(f = "VMEAN(a)", e = rep(mean(a, na.rm = TRUE), n)),
    list(f = "VSD(a)", e = rep(sd(a, na.rm = TRUE), n)),
    list(f = "VMEDIAN(a)", e = rep(median(a, na.rm = TRUE), n)),
    list(f = "VMIN(a)", e = rep(min(a, na.rm = TRUE), n)),
    list(f = "VMAX(a)", e = rep(max(a, na.rm = TRUE), n)),
    list(f = "VSUM(a)", e = rep(sum(a, na.rm = TRUE), n)),
    list(f = "N(a)", e = rep(sum(!is.na(a)), n)),
    list(f = "(a - VMEAN(a)) / VSD(a)",
         e = (a - mean(a, na.rm = TRUE)) / sd(a, na.rm = TRUE)),
    list(f = "BIN(a, 4)", e = bin_house(a, 4)),
    list(f = "TRIM(t)", e = trim_house(tv)),
    list(f = "UPPER(t2)", e = ifelse(is.na(tv2), NA_character_, toupper(tv2))),
    list(f = "LOWER(t2)", e = ifelse(is.na(tv2), NA_character_, tolower(tv2))),
    list(f = "LEN(t)", e = ifelse(is.na(tv), NA_real_, nchar(tv_chars))),
    list(f = "LEN(b)", e = ifelse(is.na(b), NA_real_, nchar(as.character(b)))),
    list(f = "CONTAINS(t, \"café\")",
         e = ifelse(is.na(tv), NA_real_, as.numeric(grepl("café", tv, fixed = TRUE)))),
    list(f = "CONTAINS(LOWER(t2), \"case\")",
         e = ifelse(is.na(tv2), NA_real_, as.numeric(grepl("case", tolower(tv2), fixed = TRUE)))),
    list(f = "(a > 0) AND (b > 0)",
         e = and_house(as.numeric(a > 0), as.numeric(b > 0))),
    list(f = "a > 0 OR ISMISSING(b)",
         e = or_house(as.numeric(a > 0), as.numeric(is.na(b)))),
    list(f = "NOT(a > 0)",
         e = ifelse(is.na(a), NA_real_, as.numeric(!(a > 0)))),
    list(f = "t = \"café\"",
         e = ifelse(is.na(tv), NA_real_, as.numeric(tv == "café"))),
    list(f = "IF(CONTAINS(LOWER(t2), \"case\"), \"y\", \"n\")",
         e = ifelse(is.na(tv2), NA_character_,
                    ifelse(grepl("case", tolower(tv2), fixed = TRUE), "y", "n")))
)
# EXP over a bounded argument (b/4 keeps it finite for every int -20..20;
# the placeholder above kept list order readable).
cases[[5]] <- list(f = "EXP(b / 4)", e = fin(exp(b / 4)))

# Negative cases: the compiler must refuse, creating no column.
errors <- c("MEAN(a)", "NOPESUCHFN(a)", "VMEAN(a + b)", "a +")

esc <- function(s) {
    s <- gsub("\\\\", "\\\\\\\\", s); s <- gsub('"', '\\\\"', s)
    s <- gsub("\n", "\\\\n", s); s <- gsub("\t", "\\\\t", s); s
}
jnum <- function(v) {
    vapply(v, function(x) {
        if (is.na(x)) "null" else sprintf("%.15g", as.numeric(x))
    }, "")
}
jstr <- function(v) {
    vapply(v, function(x) {
        if (is.na(x)) "null" else sprintf('"%s"', esc(x))
    }, "")
}
jarr <- function(v) {
    paste0("[", paste(if (is.character(v)) jstr(v) else jnum(v), collapse = ","), "]")
}
col_json <- function(v) {
    if (is.character(v)) jarr(v)
    else jarr(v)
}
case_json <- vapply(seq_along(cases), function(i) {
    cs <- cases[[i]]
    sprintf('{"formula":"%s","expect":%s}', esc(cs$f), jarr(cs$e))
}, "")
json <- sprintf(paste0(
    '{"seed":%d,"n":%d,',
    '"columns":{"a":%s,"b":%s,"c":%s,"t":%s,"t2":%s},',
    '"cases":[%s],"errors":[%s]}'),
    seed, n,
    jarr(a), jarr(b), jarr(c_),
    jarr(t_), jarr(t2),
    paste(case_json, collapse = ","),
    paste(sprintf('"%s"', vapply(errors, esc, "")), collapse = ","))
con <- file(out_path, open = "wb")
writeLines(json, con, useBytes = TRUE)
close(con)
cat(sprintf("wrote %s (%d cases, %d error cases, %d rows)\n",
            out_path, length(cases), length(errors), n))
