# Independent package oracle: car::Anova, Type III with sum contrasts, and
# its univariate repeated-measures tests with Greenhouse-Geisser correction.
# No application numerical functions are sourced here.
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[[1]] else "/tmp/pandion-anova-reference.json"
stopifnot(requireNamespace("car", quietly = TRUE), requireNamespace("jsonlite", quietly = TRUE))
seed <- as.integer(Sys.getenv("PS_ANOVA_SEED", "20260907"))
stopifnot(!is.na(seed)); set.seed(seed)
families <- c("two", "three", "rm", "mixed", "mixed2")
variants <- c("balanced", "unbalanced", "missing", "permuted", "reversed",
              "small_units", "large_units", "large_offset", "small_error",
              "zero_error", "constant", "empty_cell", "singletons", "two_occasions", "four_occasions")
cases <- list()
for (family in families) for (variant in variants) {
    set.seed(seed+match(family,families)*101L)
    cat("reference:",family,variant,"\n")
    nb <- switch(family, two=2L, three=3L, rm=0L, mixed=1L, mixed2=2L)
    dims <- switch(family, two=c(3L,2L), three=c(2L,2L,3L), rm=integer(), mixed=3L, mixed2=c(2L,2L))
    repeated <- family %in% c("rm", "mixed", "mixed2")
    k <- if (!repeated) 1L else if (variant=="two_occasions") 2L else if (variant=="four_occasions") 4L else 3L
    grid <- if (nb) expand.grid(lapply(dims, function(n) seq_len(n)-1L)) else data.frame(dummy=0L)
    names(grid) <- if (nb) LETTERS[seq_len(nb)] else "dummy"
    rows <- list(); serial <- 0L
    for (cell in seq_len(nrow(grid))) {
        n <- if (variant == "singletons") 1L else if (variant == "unbalanced") 3L+cell*2L else 8L
        if (variant == "empty_cell" && cell == nrow(grid) && nb) next
        for (i in seq_len(n)) {
            serial <- serial+1L
            ix <- if (nb) as.integer(grid[cell, ]) else integer()
            main <- sum(ix * seq_along(ix)) + if (nb>1) prod(ix+1L) else 0
            subject <- if (repeated) (if (variant == "zero_error") i else rnorm(1,0,2)) else 0
            error <- if (variant == "zero_error") rep(0,k) else rnorm(k,0,if (variant == "small_error") 1e-8 else 1)
            occasionEffect <- if(variant == "zero_error") 0.75+main*0.25 else 0.7+main*0.2
            values <- main + subject + if (repeated) (seq_len(k)-1)*occasionEffect + error else error
            if (variant == "constant") values[] <- 1e-6
            if (variant == "small_units") values <- values*1e-9
            if (variant == "large_units") values <- values*1e9
            if (variant == "large_offset") values <- values+1e9
            r <- list(id=paste0("s",serial), values=unname(values))
            for (j in seq_len(nb)) r[[LETTERS[j]]] <- ix[j]
            rows[[length(rows)+1L]] <- r
        }
    }
    if (variant == "missing") {
        rows[[2]]$values[1] <- NA_real_
        rows[[4]]$values[k] <- NA_real_
        if (nb) rows[[6]]$A <- NA_integer_
    }
    if (variant == "permuted") rows <- rows[sample.int(length(rows))]
    if (variant == "reversed") for (i in seq_along(rows)) {
        for (j in seq_len(nb)) rows[[i]][[LETTERS[j]]] <- dims[j]-1L-rows[[i]][[LETTERS[j]]]
        if (repeated) rows[[i]]$values <- rev(rows[[i]]$values)
    }
    valid <- vapply(rows,function(r) all(is.finite(r$values)) && all(vapply(LETTERS[seq_len(nb)],function(v) is.finite(r[[v]]),logical(1))),logical(1))
    used <- rows[valid]; N <- length(used)
    Y <- do.call(rbind,lapply(used,`[[`,"values"))
    d <- data.frame(row=seq_len(N))
    for (j in seq_len(nb)) d[[LETTERS[j]]] <- factor(vapply(used,function(r) r[[LETTERS[j]]],integer(1)),levels=seq_len(dims[j])-1L)
    # Losing a whole level of a single between-subject factor leaves an
    # ordinary smaller model. A missing crossed cell is non-estimable.
    refusal <- variant %in% c("zero_error", "constant", "singletons") ||
        (variant == "empty_cell" && family %in% c("two","three","mixed2"))
    if (variant == "empty_cell" && nb==0) { rows <- rows[1]; used<-rows; N<-1L; refusal<-TRUE }
    expected <- list(status=if(refusal) "refuse" else "ok", n=N)
    if (!refusal) {
        # Translation is an exact ANOVA symmetry. Center before fitting to
        # keep the independent reference from losing small differences at a
        # large response origin; values are already rounded input doubles.
        Y <- Y-Y[1,1]
        originalY <- Y
        form <- as.formula(paste("Y ~",if(nb) paste(LETTERS[seq_len(nb)],collapse="*") else "1"))
        ctr <- if(nb) setNames(rep(list("contr.sum"),nb),LETTERS[seq_len(nb)]) else NULL
        fit <- lm(form,data=d,contrasts=ctr)
        # car::Anova.lm uses an absolute 1.49e-8 RSS guard. Express the
        # reference response in residual-SD units, then convert SS back;
        # otherwise merely changing units makes car refuse valid designs.
        responseScale <- sqrt(sum(residuals(fit)^2)/length(Y))
        stopifnot(is.finite(responseScale),responseScale>0)
        Y <- Y/responseScale
        fit <- lm(form,data=d,contrasts=ctr)
        if (!repeated) {
            tab <- car::Anova(fit,type=3)
            keys <- rownames(tab)[!rownames(tab)%in%c("(Intercept)","Residuals")]
            terms <- lapply(keys,function(key) {
                ss<-tab[key,"Sum Sq"]*responseScale^2; sse<-tab["Residuals","Sum Sq"]*responseScale^2
                list(key=gsub(":","",key),ss=ss,sse=sse,df1=tab[key,"Df"],df2=tab["Residuals","Df"],
                     F=tab[key,"F value"],p=tab[key,"Pr(>F)"],eta=ss/(ss+sse),eps=1)
            })
        } else {
            av <- car::Anova(fit,type=3,idata=data.frame(occasion=factor(seq_len(k))),idesign=~occasion)
            result <- suppressWarnings(summary(av,multivariate=FALSE))
            tab<-result$univariate.tests; adj<-result$pval.adjustments
            keys<-rownames(tab)[rownames(tab)!="(Intercept)"]
            # Within-subject contrasts annihilate each subject's mean.
            # Apply that exact model symmetry before the package fit so a
            # large random intercept cannot cancel tiny within-subject error
            # in the package's covariance/epsilon calculation.
            Y <- originalY-rowMeans(originalY)
            wf <- lm(form,data=d,contrasts=ctr)
            withinScale <- sqrt(sum(residuals(wf)^2)/length(Y))
            stopifnot(is.finite(withinScale),withinScale>0)
            Y <- Y/withinScale
            wf <- lm(form,data=d,contrasts=ctr)
            wa <- car::Anova(wf,type=3,idata=data.frame(occasion=factor(seq_len(k))),idesign=~occasion)
            wr <- suppressWarnings(summary(wa,multivariate=FALSE))
            keymap<-c(A="grp",B="fac","A:B"="gf",occasion="occ","A:occasion"="og","B:occasion"="of","A:B:occasion"="ogf")
            terms<-lapply(keys,function(key) {
                within<-grepl("occasion",key,fixed=TRUE)
                tt<-if(within) wr$univariate.tests else tab
                aa<-if(within) wr$pval.adjustments else adj
                sc<-if(within) withinScale else responseScale
                eps<-if(within && k>2) aa[key,"GG eps"] else 1
                p<-if(within && k>2) aa[key,"Pr(>F[GG])"] else tt[key,"Pr(>F)"]
                ss<-tt[key,"Sum Sq"]*sc^2;sse<-tt[key,"Error SS"]*sc^2
                list(key=unname(keymap[key]),ss=ss,sse=sse,df1=tt[key,"num Df"]*eps,
                     df2=tt[key,"den Df"]*eps,F=tt[key,"F value"],p=p,eta=ss/(ss+sse),eps=eps)
            })
        }
        stopifnot(length(terms)==switch(family,two=3L,three=7L,rm=1L,mixed=3L,mixed2=7L))
        stopifnot(all(vapply(terms,function(t) all(is.finite(unlist(t[names(t)!="key"]))),logical(1))))
        expected$terms<-terms
    }
    for (i in seq_along(rows)) {
        rows[[i]]$valuesHex <- I(ifelse(is.finite(rows[[i]]$values),sprintf("%a",rows[[i]]$values),NA_character_))
        rows[[i]]$values <- I(rows[[i]]$values)
    }
    cases[[length(cases)+1L]] <- list(id=paste(family,variant,sep="_"),family=family,variant=variant,
        levels=I(unname(dims)),k=k,rows=rows,expected=expected)
}
jsonlite::write_json(list(schemaVersion=1L,seed=seed,R=as.character(getRversion()),car=as.character(packageVersion("car")),
    families=families,variants=variants,cases=cases),out,auto_unbox=TRUE,digits=I(17),na="null",pretty=TRUE)
cat("ANOVA PACKAGE REFERENCES:",length(cases),"cases; seed",seed,"; car",as.character(packageVersion("car")),"\n")
