# write a poisoned library the way a pre-fix build would have left it
cfg <- Sys.getenv("R_USER_CONFIG_DIR"); d <- file.path(cfg, "R", "pandion")
dir.create(d, recursive = TRUE, showWarnings = FALSE)
jsonlite::write_json(list(
    machineId = "M1", lastAppliedTs = 1,
    defaultPalette = "", palettes = list(
        Nice = list("red;\"><img src=x onerror=window.__PWNED=1>", "#2d5c94"))),
    file.path(d, "palettes.json"), auto_unbox = TRUE)
cat("poisoned library written\n")
