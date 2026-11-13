suppressPackageStartupMessages({
  library(ggplot2)
  library(jsonlite)
})

root <- normalizePath(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))), ".."))
summary <- fromJSON(file.path(root, "site", "data", "summary.json"), simplifyVector = FALSE)
out <- file.path(root, "site", "figures")
dir.create(out, showWarnings = FALSE)

interface_colour <- "#2a78d6"
pathogenic_colour <- "#c42c2c"
benign_colour <- "#7a7975"

theme_set(
  theme_minimal(base_size = 13) +
    theme(
      plot.background = element_rect(fill = "white", colour = NA),
      panel.grid.minor = element_blank(),
      panel.grid.major.y = element_blank(),
      strip.text = element_text(face = "bold", hjust = 0),
      legend.position = "top",
      legend.justification = "left",
      legend.title = element_blank()
    )
)

save <- function(plot, name, height) {
  ggsave(file.path(out, paste0(name, ".svg")), plot, width = 8, height = height, device = svg)
}

odds_row <- function(group, label, e) {
  data.frame(
    group = group,
    label = label,
    odds = e[["Mantel–Haenszel odds ratio"]],
    low = e[["95% CI (bootstrap over proteins)"]][[1]],
    high = e[["95% CI (bootstrap over proteins)"]][[2]]
  )
}

e <- summary$enrichment
surface <- "ordered and surface (pLDDT ≥ 70, RSA ≥ 0.2)"
residues <- "Residues compared"
matched <- "Folded surface, matched for conservation"
confidence <- "Complexes by ipSAE"
kind <- "Folded surface, by interface"
alphamissense <- "Within AlphaMissense bands"
bands <- names(e$byConfidenceBand)[startsWith(names(e$byConfidenceBand), "ipSAE")]
rows <- rbind(
  odds_row(residues, "All", e$all),
  odds_row(residues, sprintf("Folded (pLDDT ≥ %s)", summary$thresholds$plddt), e$ordered),
  odds_row(residues, "Folded and surface-exposed", e$orderedSurface),
  odds_row(matched, "Unmatched", summary$conservation$enrichment$orderedSurface$unmatched),
  odds_row(matched, "Within phyloP quarters", summary$conservation$enrichment$orderedSurface$matched),
  do.call(rbind, lapply(bands, function(b) odds_row(confidence, b, e$byConfidenceBand[[b]]))),
  odds_row(kind, "With another protein", e$byKind[["with other proteins (heterodimers)"]][[surface]]),
  odds_row(kind, "With its own copy", e$byKind[["with itself (homodimers)"]][[surface]]),
  do.call(rbind, lapply(names(e$byAlphaMissenseClass), function(b) {
    odds_row(alphamissense, sub("AlphaMissense ", "", b), e$byAlphaMissenseClass[[b]])
  }))
)
rows$group <- factor(rows$group, levels = unique(rows$group))
rows$label <- factor(rows$label, levels = rev(unique(rows$label)))

save(
  ggplot(rows, aes(odds, label)) +
    geom_vline(xintercept = 1, linetype = "dashed", colour = "grey55") +
    geom_errorbar(aes(xmin = low, xmax = high), orientation = "y", width = 0, colour = pathogenic_colour, linewidth = 0.8) +
    geom_point(colour = pathogenic_colour, size = 2.4) +
    scale_x_log10(breaks = c(0.5, 1, 2, 4), labels = as.character, limits = c(0.5, 5)) +
    facet_wrap(~group, ncol = 1, scales = "free_y", space = "free_y") +
    labs(x = "Odds ratio, pathogenic vs benign, at a predicted interface (log scale)", y = NULL),
  "enrichment",
  7
)

v <- summary$validation
bins <- length(v$all$histogram)
histogram <- function(label, x) {
  data.frame(
    series = sprintf("%s (%s pairs)", label, format(x$touching, big.mark = ",")),
    from = (seq_len(bins) - 1) * 100 / bins,
    share = unlist(x$histogram) / x$touching
  )
}
recall <- rbind(
  histogram("All pairs with a structure", v$all),
  histogram(sprintf("No structure deposited by %s", v$cutoff), v$unseen)
)
recall$series <- factor(recall$series, levels = unique(recall$series))

save(
  ggplot(recall, aes(from + 100 / bins / 2, share, fill = series)) +
    geom_col(position = position_dodge(width = 100 / bins * 0.9), width = 100 / bins * 0.85) +
    scale_fill_manual(values = c(interface_colour, pathogenic_colour)) +
    scale_x_continuous(breaks = seq(0, 100, 20), labels = function(x) paste0(x, "%")) +
    scale_y_continuous(labels = function(x) paste0(round(100 * x), "%")) +
    labs(x = "Share of the experimental interface the prediction covers", y = "Share of pairs") +
    theme(panel.grid.major.y = element_line(colour = "grey90"), panel.grid.major.x = element_blank()),
  "recall",
  3.6
)

patches <- summary$conservation$residues$patches
median_patch <- "above the median patch"
conserved <- data.frame(
  band = factor(names(patches$byConfidenceBand), levels = names(patches$byConfidenceBand)),
  share = vapply(patches$byConfidenceBand, function(p) p[[median_patch]]$interface / p$complexes, numeric(1))
)
random <- patches$all[[median_patch]]$fake / patches$all$complexes

save(
  ggplot(conserved, aes(band, share)) +
    geom_col(fill = interface_colour, width = 0.7) +
    geom_hline(yintercept = random, linetype = "dashed", colour = benign_colour) +
    annotate("label", x = 4.45, y = random, label = "a random patch ranked\nin the interface's place", hjust = 0, colour = benign_colour, size = 3.6, linewidth = 0) +
    coord_cartesian(xlim = c(0.6, 5.4)) +
    scale_y_continuous(labels = function(x) paste0(round(100 * x), "%"), limits = c(0, 1)) +
    labs(x = "Complexes by ipSAE", y = "Interfaces more conserved\nthan the median surface patch") +
    theme(panel.grid.major.y = element_line(colour = "grey90"), panel.grid.major.x = element_blank()),
  "conservation",
  3.4
)
