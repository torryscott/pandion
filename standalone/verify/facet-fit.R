# Independent facet × group model references; application output is separate.
.self <- gsub('~+~',' ',sub('--file=','',grep('--file=',commandArgs(FALSE),value=TRUE)[1]),fixed=TRUE)
setwd(normalizePath(file.path(dirname(.self),'..','..')))
Sys.setenv(GB2_NO_BUNDLE_CACHE='1',R_USER_CONFIG_DIR='/tmp/pandion-facet-config')
suppressPackageStartupMessages({library(jmvcore);library(R6)})
for(f in c('palette_library','style_library','utils','gb_family_core','spec_explode','widget','xyplotbuilder.h','xyplotbuilder.b')) source(paste0('R/',f,'.R'))
.gb2_widget_js <- function()'';environment(graphbuilder2_html)<-globalenv()
types<-c('linear','poly2','poly3','loess')
variants<-c('opposite','grouped','unequal','missing','sparse','saturated','rank_deficient','single_panel','literal','hidden_panel','ci80','ci99','missing_group','missing_facet')
cases<-list()
for(type in types)for(variant in variants){
 d<-match(type,types);degree<-min(d,3L)
 facets<-if(variant=='single_panel')'North' else if(variant=='literal')c('b¦c','c','constructor')else c('North','South')
 groups<-if(variant=='literal')c('a','a¦b','constructor','__proto__')else if(variant%in%c('grouped','sparse'))c('A','B')else ''
 hasGroup<-length(groups)>1||variant=='missing_group'
 rows<-list()
 for(fi in seq_along(facets))for(gi in seq_along(groups)){
  n<-if(variant=='unequal'&&fi==2)17L else if(variant=='sparse'&&fi==2&&gi==2)1L else if(variant=='saturated')if(type=='loess')3L else degree+1L else 31L
  x<-seq(-2,5,length.out=n)
  if(variant=='rank_deficient'&&fi==2)x<-rep(2,n)
  trend<-switch(type,linear=2*x,poly2=x+.4*x^2,poly3=x+.12*x^3,loess=2*sin(x)+x)
  y<-30*(fi-1)+10*(gi-1)+(if(fi==1)1 else -1)*trend+.17*sin(seq_len(n)*1.7)
  rows[[length(rows)+1L]]<-data.frame(x=x,y=y,group=groups[gi],facet=facets[fi])
 }
 dat<-do.call(rbind,rows)
 if(variant=='missing'){
  dat$x[c(2,35)]<-NA_real_;dat$y[c(4,37)]<-NA_real_;dat$facet[6]<-NA_character_
  dat<-rbind(dat,data.frame(x=100,y=-100,group='',facet=NA_character_))
 }
 if(variant=='missing_group')dat$group<-NA_character_
 if(variant=='missing_facet')dat$facet<-NA_character_
 dat$group<-factor(dat$group,levels=groups);dat$facet<-factor(dat$facet,levels=facets)
 level<-if(variant=='ci80').8 else if(variant=='ci99').99 else .95
 spec<-list(xyShowFit=TRUE,xyShowCI=TRUE,xyShowEllipse=TRUE,xyShowStats=TRUE,xyStatsShowEqn=TRUE,xyStatsShowR2=TRUE,xyFitFullRange=FALSE,
 xMinOverride=TRUE,xMaxOverride=TRUE,yMinOverride=TRUE,yMaxOverride=TRUE,xMin=-10,xMax=10,yMin=-1000,yMax=1000)
 if(variant=='hidden_panel')spec$hiddenFacets<-I('South')
 refs<-list()
 for(f in facets)for(g in groups){
  ok<-is.finite(dat$x)&is.finite(dat$y)&!is.na(dat$facet)&dat$facet==f
  if(hasGroup)ok<-ok&!is.na(dat$group)&dat$group==g
  sub<-dat[which(ok),];x<-sub$x;y<-sub$y;n<-length(x)
  e<-list(group=if(hasGroup)g else NULL,facet=f,n=n,available=FALSE,hostAvailable=FALSE)
  if(n>=3 && length(unique(x))>1 && length(unique(y))>1){
   m<-lm(y~x);e$stats<-list(n=n,r=unname(cor(x,y)),p=cor.test(x,y)$p.value,slope=unname(coef(m)[2]),intercept=unname(coef(m)[1]),r2=summary(m)$r.squared)
   res<-residuals(m);if(sd(res)>0)e$residuals<-as.numeric(res/sd(res))
  }
  if(n>=3){cv<-cov(cbind(x,y));if(all(is.finite(cv))&&det(cv)>1e-12)e$ellipse<-list(center=I(c(mean(x),mean(y))),cov=unname(cv),chi=qchisq(level,2))}
  if(type!='loess' && n>=degree+1 && length(unique(x))>degree){
   u<-(x-min(x))/(max(x)-min(x));model<-lm(y~poly(u,degree));grid<-seq(min(x),max(x),length.out=100)
   nd<-data.frame(u=(grid-min(x))/(max(x)-min(x)))
   if(df.residual(model)>0){v<-predict(model,nd,interval='confidence',level=level);e$fit<-list(xs=grid,ys=unname(v[,'fit']),lwrs=unname(v[,'lwr']),uprs=unname(v[,'upr']))}
   else e$fit<-list(xs=grid,ys=unname(predict(model,nd)))
   e$available<-e$hostAvailable<-TRUE;e$hostFit<-e$fit
  }
  if(type=='loess' && n>=4 && length(unique(x))>2){
   grid<-seq(min(x),max(x),length.out=100)
   direct<-loess(y~x,span=.75,control=loess.control(surface='direct'))
   dy<-as.numeric(predict(direct,data.frame(x=grid)));stopifnot(all(is.finite(dy)))
   host<-loess(y~x,span=.75);h<-predict(host,data.frame(x=grid),se=TRUE);tc<-qt(1-(1-level)/2,h$df)
   stopifnot(all(is.finite(h$fit)),all(is.finite(h$se.fit)))
   e$fit<-list(xs=grid,ys=dy);e$hostFit<-list(xs=grid,ys=as.numeric(h$fit),lwrs=as.numeric(h$fit-tc*h$se.fit),uprs=as.numeric(h$fit+tc*h$se.fit))
   e$available<-e$hostAvailable<-TRUE
  }
  refs[[length(refs)+1L]]<-e
 }
 result<-suppressWarnings(xyplotbuilder(data=dat,xvar='x',yvar='y',groupVar=if(hasGroup)'group'else NULL,facetVar='facet',labelVar=NULL,sizeVar=NULL,xyFitType=type,xyCILevel=level,xyEllipseLevel=level,chartSpec=jsonlite::toJSON(spec,auto_unbox=TRUE)))
 html<-result$widget$content;m<-regmatches(html,regexec('var __gb2_payload = (\\{.*?\\});\nvar __gb2_id',html))[[1]];stopifnot(length(m)==2)
 host<-jsonlite::fromJSON(m[2],simplifyVector=FALSE)
 cases[[paste(type,variant,sep='_')]]<-list(type=type,variant=variant,hasGroup=hasGroup,level=level,spec=spec,
 x=I(dat$x),y=I(dat$y),groups=I(as.character(dat$group)),facets=I(as.character(dat$facet)),facetLevels=I(facets),references=refs,
 host=list(xyFits=host$xyFits,xyStats=host$xyStats,xyEllipses=host$xyEllipses,xyPoints=host$xyPoints))
}
args<-commandArgs(TRUE);out<-if(length(args))args[1]else'/tmp/pandion-facet-fit.json'
writeLines(jsonlite::toJSON(list(schemaVersion=1L,rVersion=as.character(getRversion()),cases=cases),auto_unbox=TRUE,digits=I(17),null='null',na='null'),out)
cat('FACET FIT REFERENCES:',length(cases),'cases\n')
