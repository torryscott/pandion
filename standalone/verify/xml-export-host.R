# Real R-analysis -> Jamovi widget -> XML export fixtures. The source/min
# shared gates each build their own files with the selected renderer bundle.
.self <- gsub('~+~', ' ', sub('--file=', '', grep('--file=', commandArgs(FALSE), value=TRUE)[1]), fixed=TRUE)
setwd(normalizePath(file.path(dirname(.self), '..', '..')))
args <- commandArgs(trailingOnly=TRUE)
OUT <- if(length(args)) args[1] else '/tmp/pandion-xml-host'
dir.create(OUT, recursive=TRUE, showWarnings=FALSE)
Sys.setenv(GB2_INLINE_BUNDLE='1', GB2_NO_BUNDLE_CACHE='1', R_USER_CONFIG_DIR=file.path(OUT,'config'))
suppressPackageStartupMessages({library(jmvcore);library(R6)})
for(f in c('palette_library','style_library','utils','gb_family_core','spec_explode','widget',
           'plotbuilder.h','plotbuilder.b','xyplotbuilder.h','xyplotbuilder.b')) source(paste0('R/',f,'.R'))
.gb2_widget_js <- function() {
    p <- if(Sys.getenv('GB2_BUNDLE')=='min') 'inst/widget/graphbuilder2.min.js' else 'inst/widget/graphbuilder2.js'
    paste(readLines(p, warn=FALSE, encoding='UTF-8'), collapse='\n')
}
environment(graphbuilder2_html) <- globalenv()
writeHtml <- function(result, name) {
    html <- tryCatch(result$widget$content, error=function(e) result$widget$.__enclos_env__$private$.content)
    con <- file(file.path(OUT,paste0(name,'.html')),'wb');on.exit(close(con))
    writeLines(c('<meta charset="utf-8">',html),con,useBytes=TRUE)
}
groups <- c('G\001X','GX','G\\u0001X')
facets <- c('A\001B','Other')
d <- do.call(rbind,lapply(seq_along(facets),function(fi)do.call(rbind,lapply(seq_along(groups),function(gi)
    data.frame(x=1:8,y=(if(fi==1)1 else -1)*gi*(1:8)+gi-1,group=groups[gi],facet=facets[fi])))))
d$group <- factor(d$group,levels=groups);d$facet <- factor(d$facet,levels=facets)
spec <- jsonlite::toJSON(list(chartTitle='Title \001 end',chartNote='Note \013 end',
    xyShowFit=TRUE,xyShowStats=TRUE,xyShowCI=FALSE,xyShowEllipse=FALSE),auto_unbox=TRUE)
writeHtml(suppressWarnings(xyplotbuilder(data=d,xvar='x',yvar='y',groupVar='group',facetVar='facet',
    labelVar=NULL,sizeVar=NULL,xyFitType='linear',chartSpec=spec)), 'scatter')
writeHtml(plotbuilder(data=d,xvar='group',yvar='y',groupVar=NULL,facetVar=NULL,graphType='bar',chartSpec=spec), 'categorical')
cat('XML HOST: two real R analyses generated\n')
