# Real analysis output, separate from the independent car reference generator.
# The checker supplies the selected, byte-verified renderer in the empty script
# slot. No numerical reference or application payload is synthesized here.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value=TRUE)[1]), fixed=TRUE)
setwd(normalizePath(file.path(dirname(.self),"..","..")))
args<-commandArgs(trailingOnly=TRUE)
refs<-jsonlite::fromJSON(if(length(args)) args[1] else "/tmp/pandion-anova-reference.json",simplifyVector=FALSE)
OUT<-if(length(args)>1) args[2] else "/tmp/pandion-anova-host"
dir.create(OUT,recursive=TRUE,showWarnings=FALSE)
Sys.setenv(GB2_INLINE_BUNDLE="1",GB2_NO_BUNDLE_CACHE="1",R_USER_CONFIG_DIR=file.path(OUT,"config"))
suppressPackageStartupMessages({library(jmvcore);library(R6)})
for(f in c("palette_library","style_library","utils","gb_family_core","spec_explode","widget")) source(paste0("R/",f,".R"))
for(m in c("plotbuilder","rmplotbuilder")) {source(paste0("R/",m,".h.R"));source(paste0("R/",m,".b.R"))}
.gb2_widget_js<-function() "/* ANOVA_VERIFICATION_RENDERER */"
environment(graphbuilder2_html)<-globalenv()
for(cs in refs$cases) {
    cat("host:",cs$id,"\n")
    d<-data.frame(row=seq_along(cs$rows))
    fn<-LETTERS[seq_along(cs$levels)]
    for(n in fn) d[[n]]<-factor(vapply(cs$rows,function(r) if(is.null(r[[n]])) NA_character_ else paste0(n,"_",r[[n]]),character(1)))
    measures<-paste0("t",seq_len(cs$k))
    for(j in seq_len(cs$k)) d[[measures[j]]]<-vapply(cs$rows,function(r) if(is.null(r$values[[j]])) NA_real_ else r$values[[j]],numeric(1))
    if(cs$family %in% c("two","three")) {
        res<-do.call(plotbuilder,list(data=d,xvar="A",yvar="t1",groupVar="B",facetVar=if(cs$family=="three") "C" else NULL,graphType="bar"))
    } else if(cs$family=="mixed2") {
        res<-do.call(rmplotbuilder,list(data=d,measures=NULL,betweenVar=NULL,bs=c("A","B"),graphType="bar",
            rm=list(list(label="Occasions",levels=as.list(measures))),
            rmCells=lapply(measures,function(m) list(measure=m,cell=list(m)))))
    } else {
        res<-do.call(rmplotbuilder,list(data=d,measures=measures,bs=NULL,betweenVar=if(cs$family=="mixed") "A" else NULL,graphType="bar"))
    }
    html<-tryCatch(res$widget$content,error=function(e) res$widget$.__enclos_env__$private$.content)
    stopifnot(grepl("ANOVA_VERIFICATION_RENDERER",html,fixed=TRUE))
    con<-file(file.path(OUT,paste0(cs$id,".html")),"wb");writeLines(c('<meta charset="utf-8">',html),con,useBytes=TRUE);close(con)
}
cat("ANOVA REAL HOST FIXTURES:",length(refs$cases),"analyses\n")
