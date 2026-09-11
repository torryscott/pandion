# Independent model predictions for live and exported regression geometry.
# Application R payloads are captured separately, never used as references.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
setwd(normalizePath(file.path(dirname(.self), "..", "..")))
args <- commandArgs(trailingOnly = TRUE)
OUT <- if (length(args)) args[[1]] else "/tmp/pandion-fit-export.json"
Sys.setenv(GB2_NO_BUNDLE_CACHE = "1", R_USER_CONFIG_DIR = "/tmp/pandion-fit-export-config")
suppressPackageStartupMessages({library(jmvcore);library(R6)})
for (f in c("palette_library","style_library","utils","gb_family_core","spec_explode","widget","xyplotbuilder.h","xyplotbuilder.b")) source(paste0("R/",f,".R"))
.gb2_widget_js <- function() ""
environment(graphbuilder2_html) <- globalenv()
variants <- c("wide","clip","crop","off","zero_df","small_units","large_units","offset","small_response","band_only","line_only","grouped","hidden_group","literal_groups","facets")
cases <- list()
for (degree in 1:3) for (variant in variants) {
    type <- c("linear","poly2","poly3")[[degree]]
    n <- if (variant == "zero_df") degree + 1L else 21L
    z <- seq(1,5,length.out=n)
    y <- switch(degree, 2+.3*z, 1+(z-3)^2, 2+.5*(z-3)^3-.4*(z-3)) + .15*sin(seq_along(z)*2.3)
    scale_x <- if (variant == "small_units") 1e-6 else if (variant == "large_units") 1e6 else 1
    offset <- if (variant == "offset") 1000 else 0
    scale_y <- if (variant == "small_response") 1e-8 else 1
    groups <- if (variant == "literal_groups") c("__proto__","constructor","toString") else if (variant %in% c("grouped","hidden_group","facets")) c("A","B") else ""
    facets <- if (variant == "facets") c("North","South") else ""
    rows <- list()
    for (facet in facets) for (g in groups) {
        gy <- (y + (match(g,groups)-1)*.7 + (match(facet,facets)-1)*.2)*scale_y
        rows[[length(rows)+1L]] <- data.frame(x=z*scale_x+offset,y=gy,group=g,facet=facet)
    }
    data <- do.call(rbind,rows)
    data$group <- factor(data$group,levels=groups);data$facet <- factor(data$facet,levels=facets)
    xlimits <- (if (variant == "crop") c(2,4) else c(-1,7))*scale_x+offset
    ylimits <- (if (variant %in% c("clip","crop")) c(.5,4) else c(-45,50))*scale_y
    level <- if (variant == "wide") .99 else if (variant == "grouped") .8 else .95
    spec <- list(xyShowFit=variant!="band_only",xyShowCI=variant!="line_only",xyFitFullRange=variant!="off",
                 xMinOverride=TRUE,xMaxOverride=TRUE,yMinOverride=TRUE,yMaxOverride=TRUE,
                 xMin=xlimits[[1]],xMax=xlimits[[2]],yMin=ylimits[[1]],yMax=ylimits[[2]])
    if (variant=="hidden_group") spec$xyHiddenFitGroups <- I("A")
    references <- list()
    for (f in facets) for (g in groups) {
        sub <- data[data$group==g & data$facet==f,];x <- sub$x;response <- sub$y
        center <- x[[1]];scale <- max(abs(x-center));u <- (x-center)/scale
        model <- lm(response ~ poly(u,degree))
        stopifnot(model$rank==degree+1L)
        original <- seq(min(x),max(x),length.out=100)
        grid <- original
        if (spec$xyFitFullRange) {
            if (xlimits[[1]] < min(x)) grid <- c(seq(xlimits[[1]],min(x),length.out=101)[1:100],grid)
            if (xlimits[[2]] > max(x)) grid <- c(grid,seq(max(x),xlimits[[2]],length.out=101)[2:101])
        }
        reference <- function(grid) {
            nd <- data.frame(u=(grid-center)/scale)
            if (df.residual(model)>0) {
                v <- predict(model,nd,interval="confidence",level=level)
                list(xs=grid,ys=unname(v[,"fit"]),lwrs=unname(v[,"lwr"]),uprs=unname(v[,"upr"]))
            } else list(xs=grid,ys=unname(predict(model,nd)))
        }
        references[[length(references)+1L]] <- list(group=g,facet=f,df=df.residual(model),
            hidden=variant=="hidden_group" && g=="A",values=reference(grid),
            midpoints=reference((grid[-1]+grid[-length(grid)])/2))
    }
    result <- suppressWarnings(xyplotbuilder(data=data,xvar="x",yvar="y",
        groupVar=if(length(groups)>1) "group" else NULL,facetVar=if(length(facets)>1) "facet" else NULL,
        labelVar=NULL,sizeVar=NULL,xyFitType=type,xyCILevel=level,
        chartSpec=jsonlite::toJSON(spec,auto_unbox=TRUE)))
    html <- tryCatch(result$widget$content,error=function(e)result$widget$.__enclos_env__$private$.content)
    m <- regmatches(html,regexec("var __gb2_payload = (\\{.*?\\});\nvar __gb2_id",html))[[1]]
    stopifnot(length(m)==2)
    payload <- jsonlite::fromJSON(m[[2]],simplifyVector=FALSE)
    cases[[paste0(type,"_",variant)]] <- list(type=type,variant=variant,degree=degree,level=level,
        x=I(data$x),y=I(data$y),groups=I(as.character(data$group)),facets=I(as.character(data$facet)),
        panelCount=length(facets),spec=spec,references=references,hostFits=payload$xyFits)
}
writeLines(jsonlite::toJSON(list(schemaVersion=1L,rVersion=as.character(getRversion()),cases=cases),
    auto_unbox=TRUE,digits=I(17),null="null",na="null"),OUT)
cat("FIT EXPORT REFERENCES:",length(cases),"cases\n")
