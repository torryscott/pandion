# Help Me Choose - a graph chooser wizard (no chart). The wizard HTML/JS lives
# in helpmechoose_html() (R/helpmechoose_wizard.R). When the student drops the
# variables they want to plot into the optional `vars` box, .dataSummary()
# classifies their types (and flags a sequential-name pattern like T1/T2/T3 that
# signals repeated measures); the wizard then recommends the analysis whose
# variable roles actually fit that exact set. Empty box -> question route.
helpmechooseClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "helpmechooseClass",
    inherit = helpmechooseBase,
    private = list(
        .run = function() {
            # Match the chart modules: never let an unexpected error surface
            # raw - fall back to a red error div (the wizard is self-contained
            # HTML, so a failure here would otherwise blank the result).
            html <- tryCatch(
                helpmechoose_html(private$.dataSummary()),
                error = function(e) {
                    paste0(
                        '<div style="font-family:sans-serif;color:#a00;padding:12px;">',
                        '<strong>Pandion Plots error:</strong> ',
                        htmltools::htmlEscape(conditionMessage(e)),
                        '</div>'
                    )
                }
            )
            self$results$widget$setContent(html)
        },

        .dataSummary = function() {
            vars <- self$options$vars
            if (gb_family_is_missing(vars) || length(vars) == 0)
                return("null")
            data <- self$data
            info <- list()
            counts <- list(nominal = 0L, ordinal = 0L, continuous = 0L, manyLevel = 0L)
            # A response SCALE is a level SET - stored display order is
            # presentation, so the signature sorts before collapsing (Jul 10
            # 2026, Torry's field report: q1..q5 items where two carried a
            # REVERSED stored level order - the reverse-scored-item pattern -
            # split into a 2-item battery + "leftover" categoricals, firing
            # the false "no single chart can show all 4" banner and a bogus
            # no-grouping-slot cap naming battery members). Numeric-looking
            # level sets sort NUMERICALLY so a factor 0-10 scale still
            # cross-matches the numeric-battery signature ("012345678910",
            # not the string sort's "0 1 10 2 ..." order).
            sig_of <- function(lvls) {
                lvls <- as.character(lvls)
                nv <- suppressWarnings(as.numeric(lvls))
                if (length(lvls) && !anyNA(nv)) lvls <- lvls[order(nv)]
                else lvls <- sort(lvls)
                paste(lvls, collapse = "")
            }
            levelSigs <- character(0)
            levelKs <- integer(0)
            sigIsNum <- logical(0)
            sigNames <- character(0)
            contNames <- character(0)
            for (nm in vars) {
                col <- tryCatch(data[[nm]], error = function(e) NULL)
                if (is.null(col)) next
                if (is.ordered(col)) {
                    lv <- nlevels(col); type <- "ordinal"; counts$ordinal <- counts$ordinal + 1L
                    levelSigs <- c(levelSigs, sig_of(levels(col))); levelKs <- c(levelKs, lv)
                    sigIsNum <- c(sigIsNum, FALSE)
                    sigNames <- c(sigNames, nm)
                } else if (is.factor(col) || is.character(col)) {
                    lvls <- if (is.factor(col)) levels(col) else sort(unique(as.character(col[!is.na(col)])))
                    lv <- length(lvls)
                    if (lv > 20) { type <- "manylevel"; counts$manyLevel <- counts$manyLevel + 1L }
                    else {
                        type <- "nominal"; counts$nominal <- counts$nominal + 1L
                        levelSigs <- c(levelSigs, sig_of(lvls)); levelKs <- c(levelKs, lv)
                        sigIsNum <- c(sigIsNum, FALSE)
                        sigNames <- c(sigNames, nm)
                    }
                } else if (is.numeric(col)) {
                    lv <- NA_integer_; type <- "continuous"; counts$continuous <- counts$continuous + 1L
                    contNames <- c(contNames, nm)
                    # Survey items are usually TYPED continuous in jamovi (so
                    # t-tests on means run without retyping). A numeric column
                    # whose values are a SMALL set of integers (2..11 distinct,
                    # covering 1-5 agree scales through 0-10 ratings) joins the
                    # battery matching below exactly like a factor item; the
                    # collapse-"" signature matches a same-scale factor item
                    # too, so a half-converted battery still reads as one.
                    # Decimals (scores, RTs) never qualify.
                    uq <- sort(unique(as.numeric(col[is.finite(col)])))
                    if (length(uq) >= 2 && length(uq) <= 11 && all(uq == round(uq))) {
                        lv <- length(uq)
                        levelSigs <- c(levelSigs, sig_of(uq))
                        levelKs <- c(levelKs, as.integer(lv))
                        sigIsNum <- c(sigIsNum, TRUE)
                        sigNames <- c(sigNames, nm)
                    }
                } else {
                    lv <- NA_integer_; type <- "other"
                }
                info[[length(info) + 1L]] <- list(
                    name = nm, type = type,
                    levels = if (is.na(lv)) 0L else as.integer(lv))
            }
            # Likert battery: a level-set shared by several vars (k is the
            # LEVEL count, not the character count of the signature).
            # 3+ same-scale items make a battery (k 2..11 also covers 0-10
            # rating scales stored as factors). Exactly TWO items count only
            # when the shared scale is agree-like (k 4..7): two vars sharing
            # a binary or 3-level set are usually coincidental demographics
            # (yes/no), not a battery. likNum records whether the winning
            # battery includes numeric-typed items (the wizard then keeps
            # the repeated-measures reading one card away, since sequential
            # names fit both) and likK its scale-point count.
            likert <- FALSE
            likNum <- FALSE
            likK <- 0L
            likNames <- character(0)
            if (length(levelSigs) >= 2) {
                for (sig in unique(levelSigs)) {
                    idx <- which(levelSigs == sig)
                    k <- levelKs[idx[1]]
                    if ((length(idx) >= 3 && k >= 2 && k <= 11)
                        || (length(idx) == 2 && k >= 4 && k <= 7)) {
                        likert <- TRUE
                        likNum <- any(sigIsNum[idx])
                        likK <- as.integer(k)
                        # Exact battery membership (likertNames): the wizard
                        # splits battery items from tag-along variables with
                        # it, so its notes and caveats can name what will not
                        # appear instead of treating every column as one block.
                        likNames <- sigNames[idx]
                        break
                    }
                }
            }
            # Sequential numeric names (T1/T2/T3, time1/time2, ...) => the numeric
            # columns are probably one measure recorded at several occasions, i.e.
            # repeated measures. True when >= 2 numeric names share a letter prefix
            # and differ only by trailing digits.
            repeated <- FALSE
            repeatedTime <- FALSE
            if (length(contNames) >= 2) {
                seqd <- grepl("[0-9]+$", contNames) & grepl("[A-Za-z]", contNames)
                if (any(seqd)) {
                    pref <- sub("[0-9]+$", "", contNames[seqd])
                    tab <- table(pref)
                    repeated <- any(tab >= 2)
                    # A TIME-flavored sequential prefix (t1/t2, week1/week2,
                    # session1/session2, ...) is stronger identity evidence
                    # than a shared response scale: one rating recorded at
                    # several occasions is repeated measures, not a battery,
                    # so the wizard flips RM to primary. q/item-flavored or
                    # generic prefixes stay battery-first. Normalized:
                    # lowercase, trailing separators stripped, exact word
                    # match (so "trust1" never matches "t").
                    if (repeated) {
                        timeWords <- c("t", "time", "day", "wk", "week",
                                       "month", "yr", "year", "session",
                                       "sess", "wave", "visit", "trial",
                                       "occasion", "phase", "period")
                        # Scope the time test to the BATTERY columns when a
                        # numeric battery exists: repeatedTimeNames' only
                        # consumer is the wizard's battery-vs-occasions flip,
                        # which asks whether the battery columns THEMSELVES
                        # are named like times. Unrelated sequential columns
                        # outside the battery (raw t1/t2 timings beside a
                        # q1..q5 battery) must not flip it.
                        tNames <- contNames[seqd]
                        if (likNum && length(likNames))
                            tNames <- tNames[tNames %in% likNames]
                        ttab <- table(sub("[0-9]+$", "", tNames))
                        norm <- tolower(sub("[._ -]+$", "",
                                            names(ttab)[ttab >= 2]))
                        repeatedTime <- any(norm %in% timeWords)
                    }
                }
            }
            n <- tryCatch(nrow(data), error = function(e) 0L)
            jsonlite::toJSON(
                list(hasVars = TRUE, n = n, vars = info, counts = counts,
                     likertLikely = likert, likertNumBattery = likNum,
                     likertK = likK, likertNames = I(likNames),
                     repeatedLikely = repeated,
                     repeatedTimeNames = repeatedTime),
                auto_unbox = TRUE, null = "null")
        }
    )
)
